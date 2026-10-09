// Smart Features for JobPilot - Intelligence layer

class SmartFeatures {
  constructor() {
    this.storage = new StorageManager();
  }

  // 1. Duplicate Prevention - Check if already applied
  async isDuplicate(job) {
    const applications = await this.storage.getApplications();
    
    // Check by URL
    if (job.url && applications.some(app => app.url === job.url)) {
      return { isDuplicate: true, reason: 'Already applied via URL' };
    }
    
    // Check by job ID
    if (job.jobId && applications.some(app => app.jobId === job.jobId)) {
      return { isDuplicate: true, reason: 'Already applied (Job ID match)' };
    }
    
    // Check by company + title similarity
    if (job.company && job.title) {
      const duplicate = applications.find(app => {
        const sameCompany = app.company?.toLowerCase() === job.company.toLowerCase();
        const similarTitle = this.calculateSimilarity(
          app.title?.toLowerCase() || '',
          job.title.toLowerCase()
        ) > 0.8;
        return sameCompany && similarTitle;
      });
      
      if (duplicate) {
        return { isDuplicate: true, reason: 'Similar job at same company', appliedDate: duplicate.appliedDate };
      }
    }
    
    return { isDuplicate: false };
  }

  // 2. Job Quality Filter - Skip low-quality jobs
  shouldApplyToJob(job, profile, settings) {
    const reasons = [];
    
    // Check excluded keywords
    if (settings.excludeKeywords && settings.excludeKeywords.length > 0) {
      const title = (job.title || '').toLowerCase();
      const description = (job.description || '').toLowerCase();
      
      for (const keyword of settings.excludeKeywords) {
        if (title.includes(keyword.toLowerCase()) || description.includes(keyword.toLowerCase())) {
          reasons.push(`Contains excluded keyword: ${keyword}`);
          return { shouldApply: false, reasons };
        }
      }
    }
    
    // Check excluded companies
    if (settings.excludeCompanies && settings.excludeCompanies.length > 0) {
      const company = (job.company || '').toLowerCase();
      
      for (const excludedCompany of settings.excludeCompanies) {
        if (company.includes(excludedCompany.toLowerCase())) {
          reasons.push(`Excluded company: ${excludedCompany}`);
          return { shouldApply: false, reasons };
        }
      }
    }
    
    // Check salary range if specified
    if (profile.minSalary && job.salary) {
      const jobSalary = this.extractSalaryNumber(job.salary);
      if (jobSalary && jobSalary < profile.minSalary) {
        reasons.push(`Salary below minimum (${jobSalary} < ${profile.minSalary})`);
        return { shouldApply: false, reasons };
      }
    }
    
    // Check experience requirements
    if (job.experience && profile.experience) {
      const required = this.extractExperienceYears(job.experience);
      if (required && required.min > profile.experience + 2) {
        reasons.push(`Experience requirement too high (${required.min}+ years required)`);
        return { shouldApply: false, reasons };
      }
    }
    
    // Filter spam/low-quality jobs
    const spamKeywords = ['mlm', 'pyramid', 'work from home scam', 'pay to apply', 'commission only'];
    const description = (job.description || '').toLowerCase();
    for (const spam of spamKeywords) {
      if (description.includes(spam)) {
        reasons.push('Potential spam/low-quality job');
        return { shouldApply: false, reasons };
      }
    }
    
    return { shouldApply: true, reasons: ['Job passes all filters'] };
  }

  // 3. Track Application with metadata
  async trackApplication(job, profile, status = 'applied') {
    const application = {
      jobId: job.jobId || this.generateJobId(job),
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      platform: job.platform || 'Unknown',
      url: job.url || window.location.href,
      description: job.description?.substring(0, 500),
      appliedDate: new Date().toISOString(),
      status: status,
      profileUsed: {
        name: profile.name,
        email: profile.email,
        experience: profile.experience
      }
    };
    
    await this.storage.saveApplication(application);
    return application;
  }

  // 4. Rate Limiting - Don't spam
  async checkRateLimit(platform) {
    const result = await chrome.storage.local.get(['rateLimits']);
    const rateLimits = result.rateLimits || {};
    const today = new Date().toDateString();
    
    if (!rateLimits[platform]) {
      rateLimits[platform] = {};
    }
    
    const platformLimit = rateLimits[platform][today] || { count: 0, firstApply: Date.now() };
    
    // Check if hit daily limit (100 per platform per day)
    if (platformLimit.count >= 100) {
      return { allowed: false, reason: 'Daily limit reached for this platform (100)' };
    }
    
    // Check if applying too fast (minimum 10 seconds between applications)
    const timeSinceLastApply = Date.now() - (platformLimit.lastApply || 0);
    if (timeSinceLastApply < 10000) {
      return { allowed: false, reason: 'Rate limit: wait 10 seconds between applications' };
    }
    
    return { allowed: true };
  }

  // 5. Update rate limit
  async updateRateLimit(platform) {
    const result = await chrome.storage.local.get(['rateLimits']);
    const rateLimits = result.rateLimits || {};
    const today = new Date().toDateString();
    
    if (!rateLimits[platform]) {
      rateLimits[platform] = {};
    }
    
    if (!rateLimits[platform][today]) {
      rateLimits[platform][today] = { count: 0, firstApply: Date.now() };
    }
    
    rateLimits[platform][today].count++;
    rateLimits[platform][today].lastApply = Date.now();
    
    await chrome.storage.local.set({ rateLimits });
  }

  // 6. Answer Memory - Remember custom questions
  async getSmartAnswer(question) {
    const result = await chrome.storage.local.get(['savedAnswers']);
    const savedAnswers = result.savedAnswers || {};
    
    // Try exact match first
    const exactMatch = savedAnswers[question.toLowerCase()];
    if (exactMatch) {
      exactMatch.usedCount++;
      exactMatch.lastUsed = new Date().toISOString();
      await chrome.storage.local.set({ savedAnswers });
      return exactMatch.answer;
    }
    
    // Try fuzzy match
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [savedQuestion, data] of Object.entries(savedAnswers)) {
      const similarity = this.calculateSimilarity(question.toLowerCase(), savedQuestion);
      if (similarity > bestScore && similarity > 0.7) {
        bestScore = similarity;
        bestMatch = data;
      }
    }
    
    if (bestMatch) {
      bestMatch.usedCount++;
      bestMatch.lastUsed = new Date().toISOString();
      await chrome.storage.local.set({ savedAnswers });
      return bestMatch.answer;
    }
    
    return null;
  }

  // 7. Save new answer
  async saveAnswer(question, answer) {
    const result = await chrome.storage.local.get(['savedAnswers']);
    const savedAnswers = result.savedAnswers || {};
    
    savedAnswers[question.toLowerCase()] = {
      question,
      answer,
      usedCount: 1,
      lastUsed: new Date().toISOString(),
      savedDate: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ savedAnswers });
  }

  // 8. Job Score Calculator
  calculateJobScore(job, profile) {
    let score = 50; // Base score
    
    // Title match
    if (job.title && profile.jobRole) {
      const similarity = this.calculateSimilarity(
        job.title.toLowerCase(),
        profile.jobRole.toLowerCase()
      );
      score += similarity * 20;
    }
    
    // Location match
    if (job.location && profile.city) {
      if (job.location.toLowerCase().includes(profile.city.toLowerCase())) {
        score += 15;
      }
    }
    
    // Remote bonus
    if (/remote|work from home|wfh/i.test(job.description || '')) {
      score += 10;
    }
    
    // Salary match
    if (job.salary && profile.minSalary) {
      const jobSalary = this.extractSalaryNumber(job.salary);
      if (jobSalary >= profile.minSalary) {
        score += 10;
      }
    }
    
    // Posted recently
    if (job.postedDate) {
      const daysAgo = this.getDaysAgo(job.postedDate);
      if (daysAgo <= 1) score += 10;
      else if (daysAgo <= 7) score += 5;
    }
    
    return Math.min(100, Math.round(score));
  }

  // Helper functions
  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  extractSalaryNumber(salaryStr) {
    const match = salaryStr.match(/(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?|l)/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }

  extractExperienceYears(expStr) {
    const match = expStr.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*years?/i);
    if (match) {
      return { min: parseInt(match[1]), max: parseInt(match[2]) };
    }
    const singleMatch = expStr.match(/(\d+)\+?\s*years?/i);
    if (singleMatch) {
      return { min: parseInt(singleMatch[1]), max: null };
    }
    return null;
  }

  getDaysAgo(dateStr) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    } catch {
      return 999;
    }
  }

  generateJobId(job) {
    const str = `${job.company}-${job.title}-${job.location}`.toLowerCase();
    return str.replace(/[^a-z0-9]/g, '-');
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.SmartFeatures = SmartFeatures;
}
