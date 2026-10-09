// ============================================================================
// SELECTORS - Update here when LinkedIn changes its DOM
// ============================================================================
const SELECTORS = {
  EASY_APPLY_BUTTON: [
    'button[aria-label*="Easy Apply"]',
    'button:has-text("Easy Apply")'
  ],
  
  MODAL: [
    '[role="dialog"][aria-labelledby*="jobs-easy-apply"]',
    '.jobs-easy-apply-modal',
    '[data-test-modal-id="easy-apply-modal"]'
  ],
  
  NEXT_BUTTON: [
    'button[aria-label="Continue to next step"]',
    'button[aria-label="Review your application"]',
    'button:has-text("Next")',
    'button:has-text("Review")',
    '.jobs-easy-apply-modal footer button[aria-label*="Continue"]'
  ],
  
  SUBMIT_BUTTON: [
    'button[aria-label="Submit application"]',
    'button:has-text("Submit application")',
    '.jobs-easy-apply-modal footer button[type="submit"]'
  ],
  
  DISMISS_BUTTON: [
    'button[aria-label="Dismiss"]',
    'button[data-control-name="close_button"]',
    '.artdeco-modal__dismiss'
  ],
  
  DISCARD_BUTTON: [
    'button[data-control-name="discard_application_confirm_btn"]',
    'button:has-text("Discard")'
  ],
  
  FORM_INPUTS: [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])',
    'textarea',
    'select'
  ],
  
  STEP_HEADER: [
    '.jobs-easy-apply-modal h3',
    '[aria-label*="step"]'
  ],
  
  ERROR_MESSAGE: [
    '.artdeco-inline-feedback--error',
    '[role="alert"]'
  ]
};

// ============================================================================
// LOGGER
// ============================================================================
class Logger {
  constructor() {
    this.logs = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };
    
    this.logs.push(logEntry);
    console.log(`[JobPilot ${level}] ${timestamp} - ${message}`, data || '');
    
    // Send to popup
    chrome.runtime.sendMessage({
      action: 'log',
      log: logEntry
    }).catch(() => {
      // Popup might be closed, ignore
    });
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  success(message, data) {
    this.log('SUCCESS', message, data);
  }
}

const logger = new Logger();

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Sleep with random jitter for human-like behavior
 */
async function sleep(minMs = 400, maxMs = 1200) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Wait for element with timeout using MutationObserver
 * Rejects on timeout to prevent hanging
 */
function waitForElement(selectors, options = {}) {
  const timeout = options.timeout || 8000;
  const parent = options.parent || document;
  
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const existing = findElement(selectors, parent);
    if (existing) {
      resolve(existing);
      return;
    }

    let timeoutId;
    let cancelInterval;
    let observer;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (cancelInterval) clearInterval(cancelInterval);
      if (observer) observer.disconnect();
    };

    // Set hard timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for: ${selectors.join(' OR ')}`));
    }, timeout);

    if (typeof options.shouldCancel === 'function') {
      cancelInterval = setInterval(() => {
        if (options.shouldCancel()) {
          cleanup();
          reject(new Error('Wait cancelled'));
        }
      }, 100);
    }

    // Observe both inserted nodes and state changes. Many job sites keep the
    // dialog mounted and reveal it by changing class/style/aria-hidden; a
    // childList-only observer would time out even though the modal is visible.
    observer = new MutationObserver(() => {
      const element = findElement(selectors, parent);
      if (element) {
        cleanup();
        resolve(element);
      }
    });

    observer.observe(parent === document ? document.documentElement : parent, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'open'],
      characterData: true
    });

    // Re-check after observing to close the race between the initial query
    // and attaching the observer.
    const appearedDuringSetup = findElement(selectors, parent);
    if (appearedDuringSetup) {
      cleanup();
      resolve(appearedDuringSetup);
    }
  });
}

/**
 * Find element from array of selectors
 */
function findElement(selectors, parent = document) {
  for (const selector of selectors) {
    try {
      // Handle :has-text() pseudo-selector
      if (selector.includes(':has-text(')) {
        const match = selector.match(/(.*):has-text\("(.+)"\)/);
        if (match) {
          const [, baseSelector, text] = match;
          const elements = parent.querySelectorAll(baseSelector);
          const expectedText = text.trim().toLowerCase();
          for (const el of elements) {
            const actualText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (actualText.includes(expectedText) && isVisible(el)) {
              return el;
            }
          }
        }
        continue;
      }
      
      const element = parent.querySelector(selector);
      if (element && isVisible(element)) {
        return element;
      }
    } catch (e) {
      // Invalid selector, continue
      continue;
    }
  }
  return null;
}

/**
 * Check if element is visible
 */
function isVisible(element) {
  if (!element || !element.isConnected) return false;

  // Check ancestors too: a child can compute to `display:block` while an
  // ancestor modal is hidden with `display:none`.
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    const opacity = style.opacity;
    if (style.display === 'none' || style.visibility === 'hidden' || (opacity !== '' && Number(opacity) === 0)) {
      return false;
    }
  }

  const style = window.getComputedStyle(element);
  // `offsetParent` is null for fixed-position dialogs even when they are
  // visible. Only use it as a hidden check for non-fixed elements.
  if (style.position !== 'fixed' && element.offsetParent === null) {
    const rects = element.getClientRects ? element.getClientRects() : null;
    if (rects && rects.length === 0) return false;
  }

  return true;
}

/**
 * Type text with human-like delay (async, non-blocking)
 */
async function typeText(element, text) {
  element.focus();
  await sleep(100, 200);
  
  for (let i = 0; i < text.length; i++) {
    element.value = text.substring(0, i + 1);
    
    // Trigger events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Cap at 15ms per character to avoid blocking
    await new Promise(resolve => setTimeout(resolve, Math.random() * 15 + 5));
  }
  
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.blur();
  await sleep(100, 200);
}

/**
 * Fill input React-safely
 */
function fillInput(element, value) {
  // Get native setter for React compatibility
  const nativeSetter = Object.getOwnPropertyDescriptor(
    element.tagName === 'TEXTAREA' 
      ? window.HTMLTextAreaElement.prototype 
      : window.HTMLInputElement.prototype,
    'value'
  ).set;
  
  // Set value using native setter
  nativeSetter.call(element, value);
  
  // Trigger events
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Close modal gracefully
 */
async function closeModal() {
  try {
    // Click Dismiss
    const dismissBtn = findElement(SELECTORS.DISMISS_BUTTON);
    if (dismissBtn) {
      logger.info('Clicking Dismiss button');
      dismissBtn.click();
      await sleep(500, 800);
      
      // Handle Discard dialog if it appears
      const discardBtn = findElement(SELECTORS.DISCARD_BUTTON);
      if (discardBtn) {
        logger.info('Clicking Discard button');
        discardBtn.click();
        await sleep(300, 500);
      }
    }
  } catch (error) {
    logger.error('Error closing modal', error);
  }
}

/**
 * Check rate limit
 */
async function checkRateLimit() {
  const data = await chrome.storage.local.get(['rateLimitData']);
  const rateLimitData = data.rateLimitData || { applications: [], hourlyLimit: 10 };
  const hourlyLimit = Math.max(1, Number(rateLimitData.hourlyLimit) || 10);
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const applications = Array.isArray(rateLimitData.applications) ? rateLimitData.applications : [];
  const recentApps = applications
    .filter(timestamp => Number.isFinite(Number(timestamp)) && Number(timestamp) > oneHourAgo)
    .map(Number)
    .sort((a, b) => a - b);

  if (recentApps.length >= hourlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.max(0, Math.ceil((recentApps[0] + 60 * 60 * 1000 - now) / 1000 / 60))
    };
  }

  return {
    allowed: true,
    remaining: hourlyLimit - recentApps.length,
    resetIn: 0
  };
}

/**
 * Record application
 */
async function recordApplication() {
  const data = await chrome.storage.local.get(['rateLimitData']);
  const rateLimitData = data.rateLimitData || { applications: [], hourlyLimit: 10 };
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const applications = Array.isArray(rateLimitData.applications) ? rateLimitData.applications : [];

  // Keep only numeric timestamps from the last hour
  rateLimitData.applications = applications
    .map(Number)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > oneHourAgo);
  rateLimitData.applications.push(now);

  await chrome.storage.local.set({ rateLimitData });
}
