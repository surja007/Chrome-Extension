// Job Scraper - Extract jobs from LinkedIn, Naukri, Indeed

class JobScraper {
  constructor() {
    this.platform = this.detectPlatform();
  }

  detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('naukri.com')) return 'naukri';
    if (host.includes('indeed.com')) return 'indeed';
    return 'unknown';
  }

  async scrapeJobs(filters = {}) {
    switch (this.platform) {
      case 'linkedin':
        return this.scrapeLinkedIn(filters);
      case 'naukri':
        return this.scrapeNaukri(filters);
      case 'indeed':
        return this.scrapeIndeed(filters);
      default:
        return [];
    }
  }

  async scrapeLinkedIn(filters) {
    const jobs = [];
    const jobCards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');

    for (const card of jobCards) {
      try {
        const job = this.extractLinkedInJob(card);
        if (this.matchesFilters(job, filters)) {
          jobs.push(job);
        }
      } catch (error) {
        console.error('Error extracting LinkedIn job:', error);
      }
    }

    return jobs;
  }

  extractLinkedInJob(card) {
    const titleEl = card.querySelector('.job-card-list__title, .jobs-unified-top-card__job-title');
    const companyEl = card.querySelector('.job-card-container__company-name, .jobs-unified-top-card__company-name');
    const locationEl = card.querySelector('.job-card-container__metadata-item, .jobs-unified-top-card__bullet');
    const linkEl = card.querySelector('a[href*="/jobs/view/"]');
    const easyApplyBadge = card.querySelector('.job-card-container__apply-method, [data-job-posted-time]');

    return {
      title: titleEl?.textContent.trim() || '',
      company: companyEl?.textContent.trim() || '',
      location: locationEl?.textContent.trim() || '',
      url: linkEl?.href || '',
      platform: 'linkedin',
      hasEasyApply: !!card.querySelector('.job-card-container__apply-method--easy-apply'),
      postedDate: card.querySelector('[data-job-posted-time]')?.textContent.trim() || '',
      scrapedAt: Date.now()
    };
  }

  async scrapeNaukri(filters) {
    const jobs = [];
    const jobCards = document.querySelectorAll('.jobTuple, .srp-tuple');

    for (const card of jobCards) {
      try {
        const job = this.extractNaukriJob(card);
        if (this.matchesFilters(job, filters)) {
          jobs.push(job);
        }
      } catch (error) {
        console.error('Error extracting Naukri job:', error);
      }
    }

    return jobs;
  }

  extractNaukriJob(card) {
    const titleEl = card.querySelector('.title, .jobTuple-title a');
    const companyEl = card.querySelector('.comp-name, .jobTuple-companyName');
    const locationEl = card.querySelector('.location, .jobTuple-location');
    const experienceEl = card.querySelector('.experience, .jobTuple-experience');
    const salaryEl = card.querySelector('.salary, .jobTuple-salary');
    const linkEl = card.querySelector('a.title, .jobTuple-title a');

    return {
      title: titleEl?.textContent.trim() || '',
      company: companyEl?.textContent.trim() || '',
      location: locationEl?.textContent.trim() || '',
      experience: experienceEl?.textContent.trim() || '',
      salary: salaryEl?.textContent.trim() || '',
      url: linkEl?.href || window.location.origin + linkEl?.getAttribute('href') || '',
      platform: 'naukri',
      scrapedAt: Date.now()
    };
  }

  async scrapeIndeed(filters) {
    const jobs = [];
    const jobCards = document.querySelectorAll('.job_seen_beacon, .jobsearch-ResultsList > li');

    for (const card of jobCards) {
      try {
        const job = this.extractIndeedJob(card);
        if (this.matchesFilters(job, filters)) {
          jobs.push(job);
        }
      } catch (error) {
        console.error('Error extracting Indeed job:', error);
      }
    }

    return jobs;
  }

  extractIndeedJob(card) {
    const titleEl = card.querySelector('.jobTitle, h2.jobTitle a');
    const companyEl = card.querySelector('.companyName, [data-testid="company-name"]');
    const locationEl = card.querySelector('.companyLocation, [data-testid="text-location"]');
    const linkEl = card.querySelector('a.jcs-JobTitle');

    return {
      title: titleEl?.textContent.trim() || '',
      company: companyEl?.textContent.trim() || '',
      location: locationEl?.textContent.trim() || '',
      url: linkEl?.href || '',
      platform: 'indeed',
      scrapedAt: Date.now()
    };
  }

  matchesFilters(job, filters) {
    if (!job.title) return false;

    // Keyword filter
    if (filters.keywords && filters.keywords.length > 0) {
      const text = `${job.title} ${job.company}`.toLowerCase();
      const hasKeyword = filters.keywords.some(kw => 
        text.includes(kw.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Exclude keywords
    if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
      const text = `${job.title} ${job.company}`.toLowerCase();
      const hasExcluded = filters.excludeKeywords.some(kw => 
        text.includes(kw.toLowerCase())
      );
      if (hasExcluded) return false;
    }

    // Easy Apply only (LinkedIn)
    if (filters.easyApplyOnly && !job.hasEasyApply) {
      return false;
    }

    return true;
  }

  async scrapeAllPages(maxPages = 5, filters = {}) {
    const allJobs = [];
    
    for (let page = 0; page < maxPages; page++) {
      const jobs = await this.scrapeJobs(filters);
      allJobs.push(...jobs);

      // Try to go to next page
      const hasNext = await this.goToNextPage();
      if (!hasNext) break;

      await this.wait(2000);
    }

    return allJobs;
  }

  async goToNextPage() {
    let nextButton = null;

    if (this.platform === 'linkedin') {
      nextButton = document.querySelector('[aria-label="View next page"], button[aria-label="Next"]');
    } else if (this.platform === 'naukri') {
      nextButton = document.querySelector('.fright, .pagination a.active + a');
    } else if (this.platform === 'indeed') {
      nextButton = document.querySelector('[data-testid="pagination-page-next"]');
    }

    if (nextButton && !nextButton.disabled) {
      nextButton.click();
      return true;
    }

    return false;
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (typeof window !== 'undefined') {
  window.JobScraper = JobScraper;
}
