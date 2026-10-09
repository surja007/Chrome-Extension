// Job Provider System for JobPilot
// Abstract interface for different job platforms

class JobProvider {
  constructor(name) {
    this.name = name;
  }

  // Detect if current page is from this provider
  detect() {
    return false;
  }

  // Extract job details from current page
  extractJobDetails() {
    return null;
  }

  // Find apply button
  findApplyButton() {
    return null;
  }

  // Check if job has easy apply
  hasEasyApply() {
    return false;
  }

  // Extract job listing cards
  extractJobListings() {
    return [];
  }
}

// LinkedIn Provider
class LinkedInProvider extends JobProvider {
  constructor() {
    super('LinkedIn');
  }

  detect() {
    return window.location.host.includes('linkedin.com');
  }

  extractJobDetails() {
    const job = {
      platform: 'LinkedIn',
      url: window.location.href,
      title: '',
      company: '',
      location: '',
      description: '',
      salary: '',
      easyApply: false,
      jobId: this.extractJobId()
    };

    // Title
    const titleSelectors = [
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.t-24.t-bold'
    ];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.title = el.textContent.trim();
        break;
      }
    }

    // Company
    const companySelectors = [
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__subtitle-primary-grouping'
    ];
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.company = el.textContent.trim();
        break;
      }
    }

    // Location
    const locationSelectors = [
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet'
    ];
    for (const selector of locationSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.location = el.textContent.trim();
        break;
      }
    }

    // Description
    const descSelectors = [
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.jobs-description'
    ];
    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.description = el.textContent.trim();
        break;
      }
    }

    // Easy Apply check
    job.easyApply = !!document.querySelector('.jobs-apply-button--top-card');

    return job;
  }

  extractJobId() {
    const match = window.location.href.match(/currentJobId=(\d+)/);
    return match ? match[1] : null;
  }

  findApplyButton() {
    const selectors = [
      '.jobs-apply-button--top-card',
      'button[aria-label*="Easy Apply"]',
      'button:has-text("Easy Apply")'
    ];

    for (const selector of selectors) {
      const buttons = Array.from(document.querySelectorAll(selector));
      const visible = buttons.find(btn => btn.offsetParent !== null);
      if (visible) return visible;
    }

    return null;
  }

  hasEasyApply() {
    return !!document.querySelector('.jobs-apply-button--top-card');
  }

  extractJobListings() {
    const listings = [];
    const cards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');

    cards.forEach(card => {
      const listing = {
        title: card.querySelector('.job-card-list__title')?.textContent.trim() || '',
        company: card.querySelector('.job-card-container__company-name')?.textContent.trim() || '',
        location: card.querySelector('.job-card-container__metadata-item')?.textContent.trim() || '',
        easyApply: !!card.querySelector('.job-card-container__apply-method'),
        url: card.querySelector('a')?.href || '',
        element: card
      };

      if (listing.title) {
        listings.push(listing);
      }
    });

    return listings;
  }
}

// Naukri Provider
class NaukriProvider extends JobProvider {
  constructor() {
    super('Naukri');
  }

  detect() {
    return window.location.host.includes('naukri.com');
  }

  extractJobDetails() {
    const job = {
      platform: 'Naukri',
      url: window.location.href,
      title: '',
      company: '',
      location: '',
      description: '',
      salary: '',
      experience: '',
      jobId: this.extractJobId()
    };

    // Title
    const titleSelectors = ['.jd-header-title', 'h1', '.job-title'];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.title = el.textContent.trim();
        break;
      }
    }

    // Company
    const companySelectors = ['.jd-header-comp-name', '.comp-name', '.company'];
    for (const selector of companySelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.company = el.textContent.trim();
        break;
      }
    }

    // Experience & Salary
    const expEl = document.querySelector('.exp, .experience');
    if (expEl) job.experience = expEl.textContent.trim();

    const salEl = document.querySelector('.salary, .sal');
    if (salEl) job.salary = salEl.textContent.trim();

    // Location
    const locEl = document.querySelector('.location, .loc, .jd-location');
    if (locEl) job.location = locEl.textContent.trim();

    // Description
    const descSelectors = ['.job-desc', '.jd-desc', '.dang-inner-html'];
    for (const selector of descSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        job.description = el.textContent.trim();
        break;
      }
    }

    return job;
  }

  extractJobId() {
    const match = window.location.href.match(/jobId[=\/](\d+)/i);
    return match ? match[1] : null;
  }

  findApplyButton() {
    const selectors = [
      'button.apply-button',
      'a.apply',
      '.btn-apply',
      'button:contains("Apply")'
    ];

    for (const selector of selectors) {
      const buttons = Array.from(document.querySelectorAll(selector));
      const applyBtn = buttons.find(btn => 
        /apply/i.test(btn.textContent) && btn.offsetParent !== null
      );
      if (applyBtn) return applyBtn;
    }

    return null;
  }

  extractJobListings() {
    const listings = [];
    const cards = document.querySelectorAll('.jobTuple, article.job, .job-card');

    cards.forEach(card => {
      const listing = {
        title: card.querySelector('.title, .job-title')?.textContent.trim() || '',
        company: card.querySelector('.comp-name, .company')?.textContent.trim() || '',
        location: card.querySelector('.location, .loc')?.textContent.trim() || '',
        experience: card.querySelector('.exp, .experience')?.textContent.trim() || '',
        salary: card.querySelector('.salary')?.textContent.trim() || '',
        url: card.querySelector('a')?.href || '',
        element: card
      };

      if (listing.title) {
        listings.push(listing);
      }
    });

    return listings;
  }
}

// Indeed Provider
class IndeedProvider extends JobProvider {
  constructor() {
    super('Indeed');
  }

  detect() {
    return window.location.host.includes('indeed.com');
  }

  extractJobDetails() {
    const job = {
      platform: 'Indeed',
      url: window.location.href,
      title: '',
      company: '',
      location: '',
      description: '',
      salary: ''
    };

    job.title = document.querySelector('.jobsearch-JobInfoHeader-title, h1')?.textContent.trim() || '';
    job.company = document.querySelector('.jobsearch-InlineCompanyRating, .company')?.textContent.trim() || '';
    job.location = document.querySelector('.jobsearch-JobInfoHeader-subtitle, .location')?.textContent.trim() || '';
    job.description = document.querySelector('.jobsearch-jobDescriptionText, #jobDescriptionText')?.textContent.trim() || '';
    job.salary = document.querySelector('.salary, .jobsearch-JobMetadataHeader-item')?.textContent.trim() || '';

    return job;
  }

  findApplyButton() {
    return document.querySelector('.jobsearch-IndeedApplyButton, .indeed-apply-button, button:contains("Apply")');
  }
}

// Generic Provider (for unknown sites)
class GenericProvider extends JobProvider {
  constructor() {
    super('Generic');
  }

  detect() {
    return true; // Always matches as fallback
  }

  extractJobDetails() {
    const job = {
      platform: 'Unknown',
      url: window.location.href,
      title: '',
      company: '',
      location: '',
      description: ''
    };

    // Try common patterns
    job.title = document.querySelector('h1, .job-title, [class*="title"]')?.textContent.trim() || '';
    job.company = document.querySelector('.company, [class*="company"]')?.textContent.trim() || '';
    job.location = document.querySelector('.location, [class*="location"]')?.textContent.trim() || '';
    
    // Get main content
    const main = document.querySelector('main, .main, .content, article');
    if (main) {
      job.description = main.textContent.trim().substring(0, 5000);
    }

    return job;
  }

  findApplyButton() {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    return buttons.find(btn => 
      /apply|submit application|join us/i.test(btn.textContent) && 
      btn.offsetParent !== null
    );
  }
}

// Job Provider Manager
class JobProviderManager {
  constructor() {
    this.providers = [
      new LinkedInProvider(),
      new NaukriProvider(),
      new IndeedProvider(),
      new GenericProvider() // Fallback
    ];
  }

  // Get current provider
  getCurrentProvider() {
    for (const provider of this.providers) {
      if (provider.detect()) {
        return provider;
      }
    }
    return this.providers[this.providers.length - 1]; // Generic fallback
  }

  // Extract job from current page
  extractCurrentJob() {
    const provider = this.getCurrentProvider();
    const job = provider.extractJobDetails();
    
    if (job) {
      job.extractedAt = new Date().toISOString();
      job.provider = provider.name;
    }

    return job;
  }

  // Find apply button on current page
  findApplyButton() {
    const provider = this.getCurrentProvider();
    return provider.findApplyButton();
  }

  // Check if current page has easy apply
  hasEasyApply() {
    const provider = this.getCurrentProvider();
    return provider.hasEasyApply?.() || false;
  }

  // Extract job listings from search results page
  extractJobListings() {
    const provider = this.getCurrentProvider();
    return provider.extractJobListings?.() || [];
  }

  // Check if job already exists
  async isDuplicateJob(job, storage) {
    const existingApplications = await storage.getApplications();
    
    // Check by job ID
    if (job.jobId) {
      const duplicate = existingApplications.find(app => 
        app.jobId === job.jobId && app.platform === job.platform
      );
      if (duplicate) return { isDuplicate: true, reason: 'Applied previously', date: duplicate.appliedDate };
    }

    // Check by URL
    if (job.url) {
      const duplicate = existingApplications.find(app => app.url === job.url);
      if (duplicate) return { isDuplicate: true, reason: 'Applied previously', date: duplicate.appliedDate };
    }

    // Check by company + title similarity
    if (job.company && job.title) {
      const duplicate = existingApplications.find(app => {
        const sameCompany = app.company?.toLowerCase() === job.company.toLowerCase();
        const similarTitle = this.calculateSimilarity(
          app.title?.toLowerCase() || '',
          job.title.toLowerCase()
        ) > 0.8;
        return sameCompany && similarTitle;
      });
      if (duplicate) return { isDuplicate: true, reason: 'Similar job at same company', date: duplicate.appliedDate };
    }

    return { isDuplicate: false };
  }

  // Calculate string similarity
  calculateSimilarity(s1, s2) {
    const set1 = new Set(s1.split(/\s+/));
    const set2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.JobProviderManager = JobProviderManager;
  window.JobProvider = JobProvider;
}
