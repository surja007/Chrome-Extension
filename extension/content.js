// ============================================================================
// STATE MACHINE FOR LINKEDIN EASY APPLY
// ============================================================================

const STATE = {
  IDLE: 'IDLE',
  CLICK_EASY_APPLY: 'CLICK_EASY_APPLY',
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
    this.submitted = false; // true only after a confirmed submit
    this.allowUserInput = true;
    this.running = false;
    this.failureReason = null;
  }

  async start(profile, autoSubmit = false, allowUserInput = true) {
    if (this.running) throw new Error('Flow already running');
    this.running = true;
    this.profile = profile;
    this.autoSubmit = autoSubmit;
    this.allowUserInput = allowUserInput;
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
      this.failureReason = error.message;
      logger.error('Flow failed', error.message);
      await this.setState(STATE.ABORT);
    } finally {
      this.running = false;
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
          case STATE.CLICK_EASY_APPLY:
            await this.handleClickEasyApply();
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
        this.failureReason = error.message;
        logger.error(`Error in state ${this.currentState}`, error.message);
        await this.setState(STATE.ABORT);
      }
    }

    // Cleanup. Reporting/storage errors must not turn a successfully submitted
    // application into a failed flow after the submit click has already happened.
    if (this.currentState === STATE.ABORT) {
      // Leave the application dialog open so the user can correct a missing
      // field or submit manually; closing it could discard their work.
      logger.warn('Flow aborted; application dialog left open for review');
    } else {
      if (this.submitted) {
        try {
          // Only count real submissions against the rate limit and history
          await recordApplication();
          await this.recordApplicationDetails();
        } catch (error) {
          logger.error('Could not save application history', error.message);
        }
      }
      logger.success(this.submitted ? 'Flow completed successfully' : 'Flow stopped at review');
    }
  }

  async handleIdle() {
    await this.setState(STATE.CLICK_EASY_APPLY);
  }

  async handleClickEasyApply() {
    // If the modal is already open (user clicked Easy Apply manually), skip ahead
    if (findElement(SELECTORS.MODAL)) {
      logger.info('Application modal already open, skipping Easy Apply click');
      await this.setState(STATE.DETECT_MODAL);
      return;
    }

    const btn = findElement(SELECTORS.EASY_APPLY_BUTTON);
    if (!btn) {
      throw new Error('Easy Apply button not found. Open a job posting that offers Easy Apply.');
    }

    logger.info('Clicking Easy Apply button');
    btn.click();
    await sleep(100, 200);
    await this.setState(STATE.DETECT_MODAL);
  }

  async handleDetectModal() {
    logger.info('Detecting Easy Apply modal');
    
    try {
      // Wait for modal to appear, but make this wait cancellable by the Stop button.
      const modal = await waitForElement(SELECTORS.MODAL, {
        timeout: 8000,
        shouldCancel: () => this.stopRequested
      });
      logger.success('Modal detected');

      await sleep(100, 200);
      await this.setState(STATE.FILL_STEP);

    } catch (error) {
      if (this.stopRequested) {
        await this.setState(STATE.ABORT);
        return;
      }
      throw new Error('Modal not found. Is Easy Apply button clicked?');
    }
  }

  async handleFillStep() {
    this.stepCount++;
    
    if (this.stepCount > this.maxSteps) {
      throw new Error('Max steps exceeded. Aborting.');
    }
    
    logger.info(`Filling step ${this.stepCount}`);
    
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
      if (!isVisible(input) || input.disabled || input.readOnly) continue;

      // Radio controls have a non-empty default .value even while unchecked;
      // inspect the selected group instead of treating that default as an answer.
      if (this.fieldHasValue(input, modal)) {
        logger.info(`Field already filled: ${input.name || input.id}`);
        continue;
      }

      const fieldInfo = this.analyzeField(input);
      const value = this.getValueForField(fieldInfo);
      const required = input.required || input.getAttribute('aria-required') === 'true';

      if (value === null) {
        if (required) {
          logger.warn(`PAUSE: Required field needs input: ${fieldInfo.label}`);
          pauseRequired = true;
          input.style.border = '2px solid #ff6b6b';
        } else {
          logger.info(`Skipping optional field: ${fieldInfo.label}`);
        }
        continue;
      }

      // Fill without artificial per-keystroke delays. Required controls that
      // cannot be safely matched (custom questions, radio groups, file inputs)
      // are handed back to the user rather than guessed.
      try {
        const didFill = await this.fillField(input, value, fieldInfo);
        if (didFill) {
          filledCount++;
          logger.success(`Filled: ${fieldInfo.label}`);
        } else if (required) {
          logger.warn(`PAUSE: Could not safely fill required field: ${fieldInfo.label}`);
          pauseRequired = true;
          input.style.border = '2px solid #ff6b6b';
        }
      } catch (error) {
        logger.error(`Failed to fill ${fieldInfo.label}`, error.message);
        if (required) pauseRequired = true;
      }
    }
    
    logger.info(`Filled ${filledCount} fields on step ${this.stepCount}`);
    
    if (pauseRequired) {
      const message = 'Some required fields need your input before this application can be submitted.';
      chrome.runtime.sendMessage({ action: 'pauseRequired', message }).catch(() => {});

      // Queue tabs run in the background. Do not leave a hidden tab waiting for
      // user input: return a review-needed result so the background can bring
      // the tab forward and pause the queue. The popup flow can wait in-place.
      if (!this.allowUserInput) {
        logger.warn('Required fields need user review; returning to the queue manager');
        this.reviewRequired = true;
        await this.setState(STATE.DONE);
        return;
      }

      // Block here until the user fills the missing fields (or stops/closes the modal).
      // Returning without changing state would make the state machine spin in a tight loop.
      logger.warn('Pausing for user input');
      const outcome = await this.waitForUserToFill(inputs, modal);

      if (outcome === 'stop') {
        if (this.stopRequested) {
          await this.setState(STATE.ABORT);
        } else {
          throw new Error('Modal closed while waiting for your input');
        }
        return;
      }

      await sleep(100, 200);
      await this.setState(STATE.CLICK_NEXT);
      return;
    }

    await sleep(100, 200);
    await this.setState(STATE.CLICK_NEXT);
  }

  /**
   * Wait while the user manually fills required fields.
   * Returns 'continue' when all required fields have values, or 'stop' when
   * the user requested a stop, closed the modal, or the wait timed out.
   */
  fieldHasValue(input, modal) {
    if (input.type === 'checkbox') return input.checked;

    if (input.type === 'radio') {
      const radios = Array.from(modal.querySelectorAll('input[type="radio"]'));
      const group = input.name ? radios.filter(radio => radio.name === input.name) : [input];
      return group.some(radio => radio.checked);
    }

    if (input.type === 'file') {
      return !!(input.files && input.files.length);
    }

    if (input.tagName === 'SELECT') {
      const selected = input.options[input.selectedIndex];
      if (!selected) return false;
      const value = String(input.value || '').trim();
      const text = String(selected.textContent || '').trim();
      return !!value && !/^(?:please\s+)?(?:select|choose)(?:\s+an)?\b/i.test(text);
    }

    return String(input.value || '').trim().length > 0;
  }

  async waitForUserToFill(inputs, modal) {
    const timeout = 5 * 60 * 1000; // allow time for the user to answer missing fields
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (this.stopRequested) return 'stop';
      if (!modal.isConnected || !isVisible(modal)) return 'stop';

      const missingRequired = Array.from(inputs).some(input =>
        !input.disabled && !input.readOnly &&
        (input.required || input.getAttribute('aria-required') === 'true') &&
        !this.fieldHasValue(input, modal)
      );

      if (!missingRequired) {
        logger.info('Required fields filled by user, continuing');
        return 'continue';
      }

      await sleep(500, 800);
    }

    logger.warn('Timed out waiting for user input');
    return 'stop';
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
    
    // Capture a small signature so we can wait for the actual UI transition
    // instead of sleeping for a fixed second on every step.
    const headerBefore = findElement(SELECTORS.STEP_HEADER, modal);
    const textBefore = headerBefore ? headerBefore.textContent.trim() : '';
    const signatureBefore = this.getStepSignature(modal);

    logger.info('Clicking Next button');
    nextBtn.click();

    await this.waitForStepChange(modal, signatureBefore);

    // Verify step changed
    const headerAfter = findElement(SELECTORS.STEP_HEADER, modal);
    const textAfter = headerAfter ? headerAfter.textContent.trim() : '';

    const errorEl = findElement(SELECTORS.ERROR_MESSAGE, modal);
    if (errorEl) {
      throw new Error(`Step validation failed: ${errorEl.textContent.trim()}`);
    }
    if (modal.isConnected && this.getStepSignature(modal) === signatureBefore) {
      throw new Error('The form did not advance after clicking Next. Check the required fields and try again.');
    }

    logger.success(`Step changed: "${textBefore}" -> "${textAfter}"`);
    
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

  getStepSignature(modal) {
    const header = findElement(SELECTORS.STEP_HEADER, modal);
    const headerText = header ? header.textContent.replace(/\s+/g, ' ').trim() : '';
    const controls = Array.from(modal.querySelectorAll(SELECTORS.FORM_INPUTS.join(',')))
      .map(input => `${input.tagName}:${input.type || ''}:${input.name || ''}:${input.id || ''}`)
      .join('|');
    const buttons = Array.from(modal.querySelectorAll('button'))
      .filter(isVisible)
      .map(button => `${button.getAttribute('aria-label') || ''}:${(button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim()}`)
      .join('|');
    return `${headerText}::${controls}::${buttons}`;
  }

  async waitForStepChange(modal, originalSignature, timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.stopRequested || !modal.isConnected || !isVisible(modal)) return;
      if (this.getStepSignature(modal) !== originalSignature) return;
      if (findElement(SELECTORS.ERROR_MESSAGE, modal)) return;
      await sleep(100, 150);
    }
  }

  async handleReview() {
    logger.info('Reached review step');
    
    if (!this.autoSubmit) {
      logger.info('Auto-submit OFF. Stopping at review for user.');
      this.submitted = false; // filled but NOT submitted
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
    if (submitBtn.disabled) {
      throw new Error('Submit button is disabled. Check required fields and validation errors.');
    }

    logger.info('Clicking Submit button');
    submitBtn.click();

    const outcome = await this.waitForSubmissionOutcome(modal);
    if (!outcome.success) {
      throw new Error(outcome.reason || 'LinkedIn did not confirm the submission. Review the form and submit manually.');
    }

    this.submitted = true;
    logger.success('Application submission confirmed');
    await this.setState(STATE.DONE);
  }

  async waitForSubmissionOutcome(modal, timeout = 15000) {
    const successPattern = /(?:your )?application (?:has been |was )?(?:sent|submitted)|application sent to|thanks for applying|you(?:'ve| have) applied/i;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      // If LinkedIn replaces/removes the modal after submit, treat that as a
      // completed transition; otherwise require an explicit confirmation.
      if (!modal.isConnected || !isVisible(modal)) {
        return { success: true };
      }

      const confirmationText = [
        modal.innerText || modal.textContent || '',
        ...Array.from(document.querySelectorAll('[role="dialog"]'))
          .map(dialog => dialog.innerText || dialog.textContent || '')
      ].join(' ');
      if (successPattern.test(confirmationText)) {
        return { success: true };
      }

      const errorEl = findElement(SELECTORS.ERROR_MESSAGE, modal);
      if (errorEl) {
        return { success: false, reason: `LinkedIn validation error: ${errorEl.textContent.trim()}` };
      }

      await sleep(200, 350);
    }

    return {
      success: false,
      reason: 'No submission confirmation appeared. Review the form and submit manually.'
    };
  }

  /** Extract current job details for the dashboard/history. */
  extractJobDetails() {
    const host = window.location.hostname;
    const platform = host.includes('linkedin.com') ? 'linkedin'
      : host.includes('naukri.com') ? 'naukri'
      : host.includes('indeed.') ? 'indeed' : 'unknown';

    return {
      title: document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobTitle, h1')?.textContent.trim() || '',
      company: document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .companyName, [data-testid="company-name"]')?.textContent.trim() || '',
      location: document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .companyLocation, [data-testid="text-location"]')?.textContent.trim() || '',
      platform
    };
  }

  /** Persist only job metadata; candidate de details remain local in the profile. */
  async recordApplicationDetails() {
    const job = this.extractJobDetails();
    const url = window.location.href;
    const data = await chrome.storage.local.get('applications');
    const applications = Array.isArray(data.applications) ? data.applications : [];

    // Avoid adding duplicate history rows if the same result is retried.
    if (applications.some(app => app.url === url && app.status === 'applied')) {
      logger.info('Application history already contains this job URL');
      return;
    }

    applications.unshift({
      id: Date.now(),
      jobId: `${job.company}-${job.title}-${job.location}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      title: job.title || 'Unknown position',
      company: job.company || 'Unknown company',
      location: job.location,
      platform: job.platform,
      url,
      appliedDate: new Date().toISOString(),
      status: 'applied'
    });

    if (applications.length > 1000) applications.splice(1000);
    await chrome.storage.local.set({ applications });
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
    
    // Try the associated label without interpolating an arbitrary form-field
    // id into a CSS selector (some sites use ids containing punctuation).
    if (element.id) {
      const label = Array.from(document.querySelectorAll('label[for]'))
        .find(candidate => candidate.htmlFor === element.id);
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
      experience: this.profile.experience !== undefined && this.profile.experience !== null && this.profile.experience !== ''
        ? String(this.profile.experience) : null,
      company: this.profile.company || null,
      jobTitle: this.profile.jobTitle || null,
      coverLetter: this.profile.coverLetter || null,
      website: this.profile.website || null,
      github: this.profile.github || null
    };
    
    return valueMap[fieldInfo.fieldType] || null;
  }

  async fillField(element, value, fieldInfo) {
    if (!element || !isVisible(element) || element.disabled || element.readOnly) return false;

    element.focus();
    const stringValue = String(value);

    if (element.tagName === 'SELECT') {
      const wanted = stringValue.trim().toLowerCase();
      const option = Array.from(element.options).find(item =>
        item.value.trim().toLowerCase() === wanted ||
        item.textContent.trim().toLowerCase() === wanted ||
        item.textContent.trim().toLowerCase().includes(wanted)
      );
      if (!option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(element, option.value);
      else element.value = option.value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.type === 'radio') {
      // Do not guess which answer to choose for a group of custom questions.
      return false;
    } else if (element.type === 'checkbox') {
      // Checkbox answers require explicit profile data; never blindly toggle.
      return false;
    } else if (element.type === 'file') {
      return false; // Browser security does not allow extensions to set files
    } else {
      // Use the native value setter so React-controlled inputs see the change.
      // Setting the whole value is substantially faster than synthetic
      // character-by-character typing and works with LinkedIn's React forms.
      fillInput(element, stringValue);
    }

    element.blur();
    return true;
  }
}

// ============================================================================
// GLOBAL FLOW INSTANCE
// ============================================================================
let currentFlow = null;

// ============================================================================
// MESSAGE LISTENER
// ============================================================================
function isFlowBusy() {
  return !!(currentFlow && (currentFlow.running ||
    ![STATE.IDLE, STATE.DONE, STATE.ABORT].includes(currentFlow.currentState)));
}

async function runApplyFlow(profile, autoSubmit, allowUserInput = true) {
  currentFlow = new EasyApplyFlow();
  await currentFlow.start(profile, autoSubmit, allowUserInput);
  return {
    success: currentFlow.currentState === STATE.DONE && currentFlow.submitted,
    submitted: currentFlow.submitted,
    state: currentFlow.currentState,
    reviewRequired: !!currentFlow.reviewRequired,
    reason: currentFlow.currentState === STATE.ABORT
      ? (currentFlow.failureReason || 'Flow aborted; the application was left open for review.')
      : currentFlow.reviewRequired ? 'Required answers need manual review.' : undefined
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getApplyState') {
    sendResponse({
      running: !!(currentFlow && currentFlow.running),
      state: currentFlow ? currentFlow.currentState : STATE.IDLE,
      submitted: !!(currentFlow && currentFlow.submitted)
    });
    return true;
  }

  if (message.action === 'startApply') {
    (async () => {
      try {
        if (isFlowBusy()) {
          sendResponse({ success: false, error: 'Flow already running' });
          return;
        }
        if (!message.profile || !message.profile.fullName) {
          sendResponse({ success: false, error: 'No profile saved. Save your profile in the extension popup first.' });
          return;
        }
        const result = await runApplyFlow(message.profile, message.autoSubmit);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }

  if (message.action === 'applyToJob') {
    // Sent by the background auto-apply engine for each queued job
    (async () => {
      try {
        if (isFlowBusy()) {
          sendResponse({ success: false, reason: 'Another apply flow is already running on this page' });
          return;
        }
        if (!window.location.hostname.includes('linkedin.com')) {
          sendResponse({ success: false, reason: 'Auto-apply is only supported for LinkedIn Easy Apply jobs' });
          return;
        }
        if (!message.profile || !message.profile.fullName) {
          sendResponse({ success: false, reason: 'No profile saved. Save your profile in the extension popup first.' });
          return;
        }
        const settings = message.settings || {};
        // This tab is opened in the background by the queue engine. If a
        // required field needs a person, return a review state instead of
        // silently waiting in a hidden tab.
        const result = await runApplyFlow(message.profile, settings.autoSubmit !== false, false);
        sendResponse(result);
      } catch (error) {
        sendResponse({ success: false, reason: error.message });
      }
    })();
    return true; // Async response
  }

  if (message.action === 'scrapeJobs') {
    (async () => {
      try {
        if (typeof JobScraper === 'undefined') {
          sendResponse({ success: false, error: 'JobScraper is not loaded on this page' });
          return;
        }
        const scraper = new JobScraper();
        const jobs = await scraper.scrapeJobs({ easyApplyOnly: !!message.easyApplyOnly });
        sendResponse({ success: true, jobs, count: jobs.length, platform: scraper.platform });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Async response
  }

  if (message.action === 'startPlatformAutoApply') {
    // Scrape this search page and hand the jobs to the background engine
    (async () => {
      try {
        if (typeof JobScraper === 'undefined') {
          sendResponse({ success: false, error: 'JobScraper is not loaded on this page' });
          return;
        }
        const scraper = new JobScraper();
        const jobs = await scraper.scrapeJobs({ easyApplyOnly: true });
        if (jobs.length === 0) {
          sendResponse({ success: false, error: 'No Easy Apply jobs found on this page' });
          return;
        }
        const response = await chrome.runtime.sendMessage({
          action: 'startAutoApply',
          jobs,
          profile: message.profile,
          settings: message.settings
        });
        sendResponse(response || { success: true });
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
logger.info(`JobPilot content script loaded on ${window.location.hostname}`);
