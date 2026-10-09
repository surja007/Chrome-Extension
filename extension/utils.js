// ============================================================================
// SELECTORS - Update here when LinkedIn changes its DOM
// ============================================================================
const SELECTORS = {
  EASY_APPLY_BUTTON: [
    'button[aria-label*="Easy Apply"]',
    'button:has-text("Easy Apply")',
    '.jobs-apply-button--top-card button'
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
    let observer;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (observer) observer.disconnect();
    };

    // Set hard timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for: ${selectors.join(' OR ')}`));
    }, timeout);

    // Observe DOM changes
    observer = new MutationObserver(() => {
      const element = findElement(selectors, parent);
      if (element) {
        cleanup();
        resolve(element);
      }
    });

    observer.observe(parent, {
      childList: true,
      subtree: true,
      attributes: false
    });
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
          for (const el of elements) {
            if (el.textContent.trim() === text && isVisible(el)) {
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
  if (!element) return false;
  if (element.offsetParent === null) return false;
  
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  
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
  
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  // Filter applications from last hour
  const recentApps = rateLimitData.applications.filter(timestamp => timestamp > oneHourAgo);
  
  if (recentApps.length >= rateLimitData.hourlyLimit) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.ceil((recentApps[0] + 60 * 60 * 1000 - now) / 1000 / 60)
    };
  }
  
  return {
    allowed: true,
    remaining: rateLimitData.hourlyLimit - recentApps.length,
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
  
  // Keep only last hour's applications
  rateLimitData.applications = rateLimitData.applications.filter(t => t > oneHourAgo);
  rateLimitData.applications.push(now);
  
  await chrome.storage.local.set({ rateLimitData });
}
