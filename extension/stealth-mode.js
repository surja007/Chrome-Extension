// Stealth Mode - Human-like behavior to avoid detection

class StealthMode {
  constructor(settings = {}) {
    this.settings = {
      randomDelays: settings.randomDelays !== false,
      mouseMovements: settings.mouseMovements !== false,
      scrolling: settings.scrolling !== false,
      typing: settings.typing !== false,
      minDelay: settings.minDelay || 500,
      maxDelay: settings.maxDelay || 3000,
      ...settings
    };
  }

  async humanDelay() {
    const delay = this.getRandomDelay(
      this.settings.minDelay,
      this.settings.maxDelay
    );
    await this.wait(delay);
  }

  async shortDelay() {
    await this.wait(this.getRandomDelay(100, 500));
  }

  getRandomDelay(min, max) {
    // Use bell curve distribution for more natural delays
    const random = (Math.random() + Math.random() + Math.random()) / 3;
    return Math.floor(random * (max - min) + min);
  }

  async typeText(element, text, speed = 'medium') {
    const speeds = {
      fast: { min: 30, max: 80 },
      medium: { min: 50, max: 150 },
      slow: { min: 100, max: 250 }
    };

    const { min, max } = speeds[speed] || speeds.medium;

    element.focus();
    await this.shortDelay();

    for (let i = 0; i < text.length; i++) {
      element.value = text.substring(0, i + 1);
      
      // Trigger input events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

      // Random typing speed
      await this.wait(this.getRandomDelay(min, max));

      // Occasionally pause (like thinking)
      if (Math.random() < 0.05) {
        await this.wait(this.getRandomDelay(300, 800));
      }

      // Occasionally make a typo and correct it
      if (Math.random() < 0.02 && i < text.length - 1) {
        const wrongChar = String.fromCharCode(text.charCodeAt(i) + 1);
        element.value = text.substring(0, i) + wrongChar;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await this.wait(this.getRandomDelay(100, 300));
        // Backspace
        element.value = text.substring(0, i);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await this.wait(this.getRandomDelay(50, 150));
      }
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    await this.shortDelay();
    element.blur();
  }

  async simulateMouseMove(element) {
    if (!this.settings.mouseMovements) return;

    const rect = element.getBoundingClientRect();
    const steps = this.getRandomDelay(5, 15);

    for (let i = 0; i < steps; i++) {
      const x = rect.left + (rect.width * Math.random());
      const y = rect.top + (rect.height * Math.random());

      element.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: x,
        clientY: y
      }));

      await this.wait(this.getRandomDelay(10, 50));
    }
  }

  async clickElement(element) {
    if (this.settings.mouseMovements) {
      await this.simulateMouseMove(element);
    }

    // Hover
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await this.shortDelay();

    // Mouse down
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await this.wait(this.getRandomDelay(50, 150));

    // Mouse up
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    
    // Click
    element.click();
    
    await this.shortDelay();
  }

  async scrollIntoView(element, smooth = true) {
    if (!this.settings.scrolling) {
      element.scrollIntoView();
      return;
    }

    // Scroll to element gradually
    const rect = element.getBoundingClientRect();
    const targetY = window.pageYOffset + rect.top - 100;
    const startY = window.pageYOffset;
    const distance = targetY - startY;
    const duration = this.getRandomDelay(500, 1500);
    const startTime = Date.now();

    const scroll = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-in-out function
      const easeProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      window.scrollTo(0, startY + distance * easeProgress);

      if (progress < 1) {
        requestAnimationFrame(scroll);
      }
    };

    scroll();
    await this.wait(duration);
  }

  async randomScroll() {
    if (!this.settings.scrolling) return;

    const scrollAmount = this.getRandomDelay(100, 500);
    const currentY = window.pageYOffset;
    
    window.scrollTo({
      top: currentY + scrollAmount,
      behavior: 'smooth'
    });

    await this.wait(this.getRandomDelay(500, 1500));
  }

  async simulateReading(duration = null) {
    const readTime = duration || this.getRandomDelay(2000, 5000);
    
    // Scroll a bit while "reading"
    const scrolls = Math.floor(readTime / 1000);
    for (let i = 0; i < scrolls; i++) {
      await this.wait(1000);
      await this.randomScroll();
    }
  }

  async fillFieldNaturally(field, value) {
    await this.scrollIntoView(field);
    await this.humanDelay();
    
    if (this.settings.mouseMovements) {
      await this.simulateMouseMove(field);
    }

    if (this.settings.typing && typeof value === 'string') {
      await this.typeText(field, value);
    } else {
      // Quick fill for non-text fields
      field.focus();
      await this.shortDelay();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      await this.shortDelay();
      field.blur();
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Fingerprint resistance
  addRandomFingerprint() {
    // Randomly vary user agent details
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    // Add random plugins
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial"';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
    }
  }

  // Detection avoidance
  async avoidDetection() {
    // Random page visits
    if (Math.random() < 0.1) {
      await this.simulateReading();
    }

    // Random delays
    await this.humanDelay();

    // Avoid patterns
    if (Math.random() < 0.3) {
      await this.randomScroll();
    }
  }
}

if (typeof window !== 'undefined') {
  window.StealthMode = StealthMode;
}
