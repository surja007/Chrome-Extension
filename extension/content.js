// ============================================================================
// STATE MACHINE FOR LINKEDIN EASY APPLY
// ============================================================================

const STATE = {
  IDLE: 'IDLE',
  DETECT_MODAL: 'DETECT_MODAL',
  FILL_STEP: 'FILL_STEP',
  CLICK_NEXT: 'CLICK_NEXT',
  REVIEW: 'REVIEW',
  SUBMIT: 'SUBMIT',
  DONE: 'DONE',
  ABORT: 'ABORT'
};

class EasyApplyFlow {
  constructor() {
    this.currentState = STATE.IDLE;
    this.stepCount = 0;
    this.maxSteps = 10;
    this.stopRequested = false;
    this.profile = null;
    this.autoSubmit = false;
    this.lastStepHeader = '';
  }

  async start(profile, autoSubmit = false) {
    this.profile = profile;
    this.autoSubmit = autoSubmit;
    this.stopRequested = false;
    this.stepCount = 0;
    this.lastStepHeader = '';
    
    logger.info('Starting Easy Apply flow', { autoSubmit });
    
    try {
      // Check rate limit
      const rateLimit = await checkRateLimit();
      if (!rateLimit.allowed) {
        throw new Error(`Rate limit reached. Try again in ${rateLimit.resetIn} minutes.`);
      }
      
      // Run state machine
      await this.runStateMachine();
      
    } catch (error) {
      logger.error('Flow failed', error.message);
      await this.setState(STATE.ABORT);
    }
  }

  stop() {
    logger.warn('Stop requested by user');
    this.stopRequested = true;
  }

  async setState(newState) {
    logger.info(`State transition: ${this.currentState} -> ${newState}`);
    this.currentState = newState;
    
    // Send state update to popup
    chrome.runtime.sendMessage({
      action: 'stateUpdate',
      state: newState
    }).catch(() => {});
  }

  async runStateMachine() {
    while (this.currentState !== STATE.DONE && this.currentState !== STATE.ABORT) {
      // Check stop flag between every state
      if (this.stopRequested) {
        logger.warn('Stop flag detected, aborting');
        await this.setState(STATE.ABORT);
        break;
      }

      try {
        switch (this.currentState) {
          case STATE.IDLE:
            await this.handleIdle();
            break;
          case STATE.DETECT_MODAL:
            await this.handleDetectModal();
            break;
          case STATE.FILL_STEP:
            await this.handleFillStep();
            break;
          case STATE.CLICK_NEXT:
            await this.handleClickNext();
            break;
          case STATE.REVIEW:
            await this.handleReview();
            break;
          case STATE.SUBMIT:
            await this.handleSubmit();
            break;
          default:
            throw new Error(`Unknown state: ${this.currentState}`);
        }
      } catch (error) {
        logger.error(`Error in state ${this.currentState}`, error.message);
        await this.setState(STATE.ABORT);
      }
    }

    // Cleanup
    if (this.currentState === STATE.ABORT) {
      await closeModal();
      logger.warn('Flow aborted');
    } else {
      await recordApplication();
      logger.success('Flow completed successfully');
    }
  }

  async handleIdle() {
    await this.setState(STATE.DETECT_MODAL);
  }

  async handleDetectModal() {
    logger.info('Detecting Easy Apply modal');
    
    try {
      // Wait for modal to appear
      const modal = await waitForElement(SELECTORS.MODAL, { timeout: 8000 });
      logger.success('Modal detected');
      
      await sleep();
      await this.setState(STATE.FILL_STEP);
      
    } catch (error) {
      throw new Error('Modal not found. Is Easy Apply button clicked?');
    }
  }

  async handleFillStep() {
    this.stepCount++;
    
    if (this.stepCount > this.maxSteps) {
      throw new Error('Max steps exceeded. Aborting.');
    }
    
    logger.info(`Filling step ${this.stepCount}`);
    
    // Get step header to detect step changes
    const headerEl = findElement(SELECTORS.STEP_HEADER);
    const currentStepHeader = headerEl ? headerEl.textContent.trim() : '';
    
    // Find modal
    const modal = findElement(SELECTORS.MODAL);
    if (!modal) {
      throw new Error('Modal disappeared during fill');
    }
    
    // Find all inputs in modal
    const inputs = modal.querySelectorAll(SELECTORS.FORM_INPUTS.join(','));
    
    if (inputs.length === 0) {
      logger.warn('No inputs found on this step, checking for next button');
      await this.setState(STATE.CLICK_NEXT);
      return;
    }
    
    let filledCount = 0;
    let pauseRequired = false;
    
    for (const input of inputs) {
      if (!isVisible(input)) continue;
      if (input.disabled || input.readOnly) continue;
      
      // Skip if already filled
      if (input.value && input.value.trim().length > 0) {
        logger.info(`Field already filled: ${input.name || input.id}`);
        continue;
      }
      
      const fieldInfo = this.analyzeField(input);
      const value = this.getValueForField(fieldInfo);
      
      if (value === null) {
        // Required field but no value in profile
        if (input.required || input.getAttribute('aria-required') === 'true') {
          logger.warn(`PAUSE: Required field needs input: ${fieldInfo.label}`, fieldInfo);
          pauseRequired = true;
          input.style.border = '2px solid #ff6b6b';
          continue;
        } else {
          logger.info(`Skipping optional field: ${fieldInfo.label}`);
          continue;
        }
      }
      
      // Fill the field
      try {
        await this.fillField(input, value, fieldInfo);
        filledCount++;
        logger.success(`Filled: ${fieldInfo.label} = ${value}`);
        await sleep(200, 400);
      } catch (error) {
        logger.error(`Failed to fill ${fieldInfo.label}`, error.message);
      }
    }
    
    logger.info(`Filled ${filledCount} fields on step ${this.stepCount}`);
    
    if (pauseRequired) {
      // Send message to popup to notify user
      chrome.runtime.sendMessage({
        action: 'pauseRequired',
        message: 'Some required fields need your input. Please fill them and click Next manually.'
      }).catch(() => {});
      
      // Stay in current state, user will click next
      logger.warn('Pausing for user input');
      return;
    }
    
    await sleep();
    await this.setState(STATE.CLICK_NEXT);
  }

  async handleClickNext() {
    logger.info('Looking for Next/Submit button');
    
    const modal = findElement(SELECTORS.MODAL);
    if (!modal) {
      throw new Error('Modal disappeared');
    }
    
    // Check for Submit button first
    const submitBtn = findElement(SELECTORS.SUBMIT_BUTTON, modal);
    if (submitBtn) {
      logger.info('Found Submit button');
      await this.setState(STATE.REVIEW);
      return;
    }
    
    // Look for Next/Review button
    const nextBtn = findElement(SELECTORS.NEXT_BUTTON, modal);
    if (!nextBtn) {
      // Check for validation errors
      const errorEl = findElement(SELECTORS.ERROR_MESSAGE, modal);
      if (errorEl) {
        throw new Error(`Validation error: ${errorEl.textContent.trim()}`);
      }
      throw new Error('No Next or Submit button found');
    }
    
    // Get current step header before clicking
    const headerBefore = findElement(SELECTORS.STEP_HEADER);
    const textBefore = headerBefore ? headerBefore.textContent.trim() : '';
    
    logger.info('Clicking Next button');
    nextBtn.click();
    
    await sleep(1000, 1500);
    
    // Verify step changed
    const headerAfter = findElement(SELECTORS.STEP_HEADER);
    const textAfter = headerAfter ? headerAfter.textContent.trim() : '';
    
    if (textBefore === textAfter && textBefore.length > 0) {
      // Step didn't change, might be validation error
      const errorEl = findElement(SELECTORS.ERROR_MESSAGE);
      if (errorEl) {
        throw new Error(`Step validation failed: ${errorEl.textContent.trim()}`);
      }
      logger.warn('Step header unchanged, but no error. Continuing anyway.');
    } else {
      logger.success(`Step changed: "${textBefore}" -> "${textAfter}"`);
    }
    
    this.lastStepHeader = textAfter;
    
    // Check if modal still exists
    const stillHasModal = findElement(SELECTORS.MODAL);
    if (!stillHasModal) {
      logger.warn('Modal closed after Next click');
      await this.setState(STATE.DONE);
      return;
    }
    
    // Go back to fill next step
    await this.setState(STATE.FILL_STEP);
  }

  async handleReview() {
    logger.info('Reached review step');
    
    if (!this.autoSubmit) {
      logger.info('Auto-submit OFF. Stopping at review for user.');
      await this.setState(STATE.DONE);
      
      // Notify popup
      chrome.runtime.sendMessage({
        action: 'reviewReady',
        message: 'Application filled and ready for review. Click Submit manually.'
      }).catch(() => {});
      
      return;
    }
    
    // Auto-submit is ON
    await this.setState(STATE.SUBMIT);
  }

  async handleSubmit() {
    logger.info('Submitting application');
    
    const modal = findElement(SELECTORS.MODAL);
    if (!modal) {
      throw new Error('Modal disappeared before submit');
    }
    
    const submitBtn = findElement(SELECTORS.SUBMIT_BUTTON, modal);
    if (!submitBtn) {
      throw new Error('Submit button not found');
    }
    
    logger.info('Clicking Submit button');
    submitBtn.click();
    
    await sleep(1500, 2000);
    
    // Wait for modal to close or success message
    try {
      await waitForElement(['.artdeco-modal__header:has-text("Application sent")'], { timeout: 5000 });
      logger.success('Application submitted successfully!');
    } catch {
      // Modal might just close
      logger.success('Submit clicked, assuming success');
    }
    
    await this.setState(STATE.DONE);
  }

  analyzeField(element) {
    const label = this.getFieldLabel(element);
    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();
    const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
    const type = element.type || element.tagName.toLowerCase();
    
    const combined = `${label} ${name} ${id} ${placeholder} ${ariaLabel}`.toLowerCase();
    
    return {
      element,
      label: label || placeholder || name || id,
      combined,
      type,
      fieldType: this.detectFieldType(combined, type)
    };
  }

  detectFieldType(combined, inputType) {
    if (/first.*name|given.*name/i.test(combined)) return 'firstName';
    if (/last.*name|family.*name|surname/i.test(combined)) return 'lastName';
    if (/^name$|full.*name/i.test(combined)) return 'fullName';
    if (/email|e-mail/i.test(combined)) return 'email';
    if (/phone|mobile|telephone/i.test(combined)) return 'phone';
    if (/linkedin|profile.*url/i.test(combined)) return 'linkedinUrl';
    if (/city|location/i.test(combined)) return 'city';
    if (/address/i.test(combined)) return 'address';
    if (/years.*experience|experience.*years|yoe/i.test(combined)) return 'experience';
    if (/current.*company|employer/i.test(combined)) return 'company';
    if (/job.*title|current.*role|position/i.test(combined)) return 'jobTitle';
    if (/cover.*letter|why.*apply|additional.*info/i.test(combined)) return 'coverLetter';
    if (/website|portfolio/i.test(combined)) return 'website';
    if (/github/i.test(combined)) return 'github';
    
    return 'unknown';
  }

  getFieldLabel(element) {
    // Try label element
    if (element.labels && element.labels[0]) {
      return element.labels[0].textContent.trim();
    }
    
    // Try aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    
    // Try for= label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }
    
    // Try parent with label
    const parent = element.closest('.jobs-easy-apply-form-element, .fb-dash-form-element, [class*="form-element"]');
    if (parent) {
      const label = parent.querySelector('label');
      if (label) return label.textContent.trim();
    }
    
    return '';
  }

  getValueForField(fieldInfo) {
    if (!this.profile) return null;
    
    const [firstName, ...lastParts] = (this.profile.fullName || '').split(' ');
    const lastName = lastParts.join(' ');
    
    const valueMap = {
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: this.profile.fullName || null,
      email: this.profile.email || null,
      phone: this.profile.phone || null,
      linkedinUrl: this.profile.linkedinUrl || null,
      city: this.profile.city || null,
      address: this.profile.address || null,
      experience: this.profile.experience || null,
      company: this.profile.company || null,
      jobTitle: this.profile.jobTitle || null,
      coverLetter: this.profile.coverLetter || null,
      website: this.profile.website || null,
      github: this.profile.github || null
    };
    
    return valueMap[fieldInfo.fieldType] || null;
  }

  async fillField(element, value, fieldInfo) {
    element.focus();
    await sleep(100, 200);
    
    if (element.tagName === 'SELECT') {
      // Handle select
      for (const option of element.options) {
        if (option.value === value || option.text.includes(value)) {
          element.value = option.value;
          break;
        }
      }
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
    } else if (element.type === 'radio') {
      // Handle radio
      element.checked = true;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
    } else if (element.type === 'checkbox') {
      // Handle checkbox
      element.checked = Boolean(value);
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
    } else {
      // Handle text/textarea/number
      // Type slowly for important fields
      if (['email', 'phone', 'fullName'].includes(fieldInfo.fieldType)) {
        await typeText(element, value.toString());
      } else {
        fillInput(element, value.toString());
      }
    }
    
    await sleep(100, 200);
    element.blur();
  }
}

// ============================================================================
// GLOBAL FLOW INSTANCE
// ============================================================================
let currentFlow = null;

// ============================================================================
// MESSAGE LISTENER
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startApply') {
    (async () => {
      try {
        if (currentFlow && currentFlow.currentState !== STATE.IDLE) {
          sendResponse({ success: false, error: 'Flow already running' });
          return;
        }
        
        currentFlow = new EasyApplyFlow();
        await currentFlow.start(message.profile, message.autoSubmit);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }
  
  if (message.action === 'stopApply') {
    if (currentFlow) {
      currentFlow.stop();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No flow running' });
    }
    return true;
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================
logger.info('JobPilot content script loaded on LinkedIn');
