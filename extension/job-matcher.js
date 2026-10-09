// AI Job Matcher for JobPilot
// Calculates match scores between candidate and jobs

class JobMatcher {
  constructor() {
    // Lazy load to avoid circular dependencies
    this._ai = null;
  }

  get ai() {
    if (!this._ai && typeof AIEngine !== 'undefined') {
      this._ai = new AIEngine();
    }
    return this._ai;
  }

  // Main matching function
  calculateMatch(candidate, job) {
    const scores = {
      skills: this.scoreSkills(candidate, job),
      experience: this.scoreExperience(candidate, job),
      education: this.scoreEducation(candidate, job),
      location: this.scoreLocation(candidate, job),
      salary: this.scoreSalary(candidate, job),
      jobType: this.scoreJobType(candidate, job)
    };

    // Weighted overall score
    const weights = {
      skills: 0.35,
      experience: 0.25,
      education: 0.15,
      location: 0.10,
      salary: 0.10,
      jobType: 0.05
    };

    const overall = Object.entries(scores).reduce((sum, [key, score]) => {
      return sum + (score * weights[key]);
    }, 0);

    return {
      overallScore: Math.round(overall),
      breakdown: scores,
      matchDetails: this.generateMatchDetails(candidate, job, scores),
      recommendation: this.generateRecommendation(overall, scores)
    };
  }

  // Score skills match
  scoreSkills(candidate, job) {
    const candidateSkills = new Set(
      (candidate.skills || []).map(s => s.toLowerCase())
    );
    
    const jobSkills = this.extractJobSkills(job.description || '');
    
    if (jobSkills.required.length === 0 && jobSkills.preferred.length === 0) {
      return 70; // Default if no skills detected
    }

    // Calculate matches
    const requiredMatches = jobSkills.required.filter(s => 
      candidateSkills.has(s.toLowerCase())
    );
    
    const preferredMatches = jobSkills.preferred.filter(s => 
      candidateSkills.has(s.toLowerCase())
    );

    // Required skills are critical (70% weight)
    const requiredScore = jobSkills.required.length > 0
      ? (requiredMatches.length / jobSkills.required.length) * 100
      : 100;
    
    // Preferred skills are bonus (30% weight)
    const preferredScore = jobSkills.preferred.length > 0
      ? (preferredMatches.length / jobSkills.preferred.length) * 100
      : 100;

    return Math.round(requiredScore * 0.7 + preferredScore * 0.3);
  }

  // Extract required and preferred skills from job description
  extractJobSkills(description) {
    const lower = description.toLowerCase();
    const required = new Set();
    const preferred = new Set();

    // Common skill keywords
    const skills = [
      'javascript', 'python', 'java', 'react', 'angular', 'vue', 'node',
      'spring', 'django', 'flask', 'sql', 'mongodb', 'postgres', 'mysql',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'rest api',
      'graphql', 'typescript', 'html', 'css', 'agile', 'scrum'
    ];

    // Find required section
    const requiredSection = lower.match(/(?:required|must have|required skills)[:\s]+([\s\S]{0,500}?)(?:\n\n|preferred|nice to have|$)/i);
    if (requiredSection) {
      skills.forEach(skill => {
        if (requiredSection[1].includes(skill)) {
          required.add(skill);
        }
      });
    }

    // Find preferred section
    const preferredSection = lower.match(/(?:preferred|nice to have|bonus|optional)[:\s]+([\s\S]{0,500}?)(?:\n\n|$)/i);
    if (preferredSection) {
      skills.forEach(skill => {
        if (preferredSection[1].includes(skill) && !required.has(skill)) {
          preferred.add(skill);
        }
      });
    }

    // If no explicit sections, check entire description
    if (required.size === 0) {
      skills.forEach(skill => {
        if (lower.includes(skill)) {
          required.add(skill);
        }
      });
    }

    return {
      required: Array.from(required),
      preferred: Array.from(preferred)
    };
  }

  // Score experience match
  scoreExperience(candidate, job) {
    const candidateYears = candidate.experience || candidate.totalExperienceYears || 0;
    const jobRequirement = this.extractExperienceRequirement(job.description || '');

    if (!jobRequirement.min && !jobRequirement.max) {
      return 85; // No requirement specified
    }

    const min = jobRequirement.min || 0;
    const max = jobRequirement.max || 999;

    // Perfect match if within range
    if (candidateYears >= min && candidateYears <= max) {
      return 100;
    }

    // Slightly below minimum
    if (candidateYears < min) {
      const diff = min - candidateYears;
      if (diff === 1) return 85;
      if (diff === 2) return 70;
      if (diff === 3) return 55;
      return Math.max(30, 100 - (diff * 15));
    }

    // Above maximum (usually still acceptable)
    if (candidateYears > max) {
      const diff = candidateYears - max;
      if (diff <= 2) return 95;
      if (diff <= 5) return 85;
      return 75;
    }

    return 50;
  }

  // Extract experience requirement from job description
  extractExperienceRequirement(description) {
    const patterns = [
      /(\d+)\+?\s*(?:to|-)\s*(\d+)\+?\s*years/i,
      /(\d+)-(\d+)\s*years/i,
      /(\d+)\+\s*years/i,
      /minimum\s+(\d+)\s*years/i,
      /at least\s+(\d+)\s*years/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        if (match[2]) {
          return { min: parseInt(match[1]), max: parseInt(match[2]) };
        } else {
          return { min: parseInt(match[1]), max: null };
        }
      }
    }

    // Check for level indicators
    if (/entry.level|junior|fresher|0.2 years/i.test(description)) {
      return { min: 0, max: 2 };
    }
    if (/mid.level|intermediate/i.test(description)) {
      return { min: 3, max: 6 };
    }
    if (/senior|lead/i.test(description)) {
      return { min: 6, max: null };
    }

    return { min: null, max: null };
  }

  // Score education match
  scoreEducation(candidate, job) {
    const candidateEducation = (candidate.education || []).map(e => 
      (e.degree || e).toLowerCase()
    );

    const jobEducation = this.extractEducationRequirement(job.description || '');

    if (jobEducation.length === 0) {
      return 90; // No specific requirement
    }

    // Check if candidate has any required degree
    for (const required of jobEducation) {
      for (const candidateDegree of candidateEducation) {
        if (candidateDegree.includes(required) || required.includes(candidateDegree)) {
          return 100;
        }
      }
    }

    // Has bachelor's but master's required
    const hasBachelors = candidateEducation.some(d => /bachelor|b\.?tech|b\.?e|bca|b\.?sc/i.test(d));
    const needsMasters = jobEducation.some(d => /master|m\.?tech|m\.?e|mca|mba|m\.?sc/i.test(d));
    
    if (hasBachelors && needsMasters) {
      return 75;
    }

    // Has any degree
    if (candidateEducation.length > 0) {
      return 80;
    }

    return 60;
  }

  // Extract education requirements
  extractEducationRequirement(description) {
    const degrees = [];
    const lower = description.toLowerCase();

    const patterns = [
      /bachelor|b\.?tech|b\.?e|bca|b\.?sc/i,
      /master|m\.?tech|m\.?e|mca|mba|m\.?sc/i,
      /phd|doctorate/i
    ];

    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        const match = lower.match(pattern);
        if (match) degrees.push(match[0]);
      }
    }

    return degrees;
  }

  // Score location match
  scoreLocation(candidate, job) {
    const candidateLocation = (candidate.city || candidate.location || '').toLowerCase();
    const jobLocation = (job.location || '').toLowerCase();

    // Remote positions
    if (/remote|work from home|wfh/i.test(jobLocation)) {
      if (candidate.preferences?.remote !== false) {
        return 100;
      }
      return 80;
    }

    // Hybrid positions
    if (/hybrid/i.test(jobLocation)) {
      return 95;
    }

    // Same city
    if (candidateLocation && jobLocation && jobLocation.includes(candidateLocation)) {
      return 100;
    }

    // Relocation willingness
    if (candidate.preferences?.willingToRelocate) {
      return 80;
    }

    // Different location, no relocation
    if (candidateLocation && jobLocation && candidateLocation !== jobLocation) {
      return 40;
    }

    return 70; // Unknown
  }

  // Score salary match
  scoreSalary(candidate, job) {
    const candidateMin = candidate.minSalary || candidate.expectedSalary || 0;
    const candidateMax = candidate.maxSalary || (candidateMin * 1.3);

    const jobSalary = this.extractSalaryRange(job.description || '' + ' ' + (job.salary || ''));

    if (!jobSalary.min && !jobSalary.max) {
      return 75; // No salary info
    }

    const jobMin = jobSalary.min || 0;
    const jobMax = jobSalary.max || jobSalary.min;

    // Job offers more than candidate expects
    if (jobMin >= candidateMin) {
      return 100;
    }

    // Job offers close to expectations
    const ratio = candidateMin > 0 ? (jobMax / candidateMin) : 1;
    if (ratio >= 0.9) return 95;
    if (ratio >= 0.8) return 85;
    if (ratio >= 0.7) return 70;
    if (ratio >= 0.6) return 55;

    return 40;
  }

  // Extract salary range from text
  extractSalaryRange(text) {
    // Indian format (LPA)
    const lpaPattern = /(\d+\.?\d*)\s*(?:to|-)\s*(\d+\.?\d*)\s*lpa/i;
    const lpaMatch = text.match(lpaPattern);
    if (lpaMatch) {
      return {
        min: parseFloat(lpaMatch[1]) * 100000,
        max: parseFloat(lpaMatch[2]) * 100000,
        currency: 'INR'
      };
    }

    // Single LPA
    const singleLpaPattern = /(\d+\.?\d*)\s*lpa/i;
    const singleLpaMatch = text.match(singleLpaPattern);
    if (singleLpaMatch) {
      const amount = parseFloat(singleLpaMatch[1]) * 100000;
      return { min: amount, max: amount, currency: 'INR' };
    }

    // USD format
    const usdPattern = /\$(\d+)k?\s*(?:to|-)\s*\$?(\d+)k?/i;
    const usdMatch = text.match(usdPattern);
    if (usdMatch) {
      return {
        min: parseInt(usdMatch[1]) * 1000,
        max: parseInt(usdMatch[2]) * 1000,
        currency: 'USD'
      };
    }

    return { min: null, max: null, currency: null };
  }

  // Score job type match
  scoreJobType(candidate, job) {
    const candidatePrefs = candidate.preferences || {};
    const jobType = (job.type || job.employmentType || '').toLowerCase();
    const jobDescription = (job.description || '').toLowerCase();

    // Employment type match
    if (candidatePrefs.employmentType) {
      const prefType = candidatePrefs.employmentType.toLowerCase();
      if (jobType.includes(prefType) || jobDescription.includes(prefType)) {
        return 100;
      }
      return 70;
    }

    // Default scores for common types
    if (jobType.includes('full') || jobDescription.includes('full-time')) {
      return 95;
    }

    return 85;
  }

  // Generate detailed match explanation
  generateMatchDetails(candidate, job, scores) {
    const details = {
      strengths: [],
      weaknesses: [],
      matchingSkills: [],
      missingSkills: []
    };

    // Skills analysis
    const jobSkills = this.extractJobSkills(job.description || '');
    const candidateSkills = new Set((candidate.skills || []).map(s => s.toLowerCase()));

    details.matchingSkills = jobSkills.required.filter(s => 
      candidateSkills.has(s.toLowerCase())
    );

    details.missingSkills = jobSkills.required.filter(s => 
      !candidateSkills.has(s.toLowerCase())
    );

    // Generate strengths
    if (scores.skills >= 80) {
      details.strengths.push('Strong technical skill match');
    }
    if (scores.experience >= 85) {
      details.strengths.push('Experience level aligns well');
    }
    if (scores.location >= 90) {
      details.strengths.push('Preferred location match');
    }
    if (scores.salary >= 90) {
      details.strengths.push('Salary meets expectations');
    }

    // Generate weaknesses
    if (scores.skills < 60) {
      details.weaknesses.push('Missing key technical skills');
    }
    if (scores.experience < 60) {
      details.weaknesses.push('Experience level mismatch');
    }
    if (scores.location < 50) {
      details.weaknesses.push('Location not preferred');
    }

    return details;
  }

  // Generate recommendation
  generateRecommendation(overallScore, scores) {
    if (overallScore >= 85) {
      return {
        action: 'highly_recommended',
        priority: 'high',
        message: '🔥 Excellent match! Strongly recommend applying.',
        confidence: 'high'
      };
    }

    if (overallScore >= 70) {
      return {
        action: 'recommended',
        priority: 'medium',
        message: '✓ Good match. Recommend applying.',
        confidence: 'medium'
      };
    }

    if (overallScore >= 55) {
      return {
        action: 'consider',
        priority: 'low',
        message: '~ Fair match. Consider applying if interested.',
        confidence: 'low'
      };
    }

    return {
      action: 'skip',
      priority: 'very_low',
      message: '✗ Poor match. Consider skipping.',
      confidence: 'low'
    };
  }

  // Calculate job quality score (independent of candidate)
  calculateJobQuality(job) {
    let score = 50; // Base score

    // Has detailed description
    if ((job.description || '').length > 500) {
      score += 10;
    }

    // Salary mentioned
    const salaryInfo = this.extractSalaryRange(job.description || '' + ' ' + (job.salary || ''));
    if (salaryInfo.min || salaryInfo.max) {
      score += 15;
    }

    // Remote/Hybrid
    if (/remote|work from home/i.test(job.description || '')) {
      score += 10;
    }
    if (/hybrid/i.test(job.description || '')) {
      score += 5;
    }

    // Reputable companies
    const reputableCompanies = [
      'google', 'microsoft', 'amazon', 'facebook', 'meta', 'apple',
      'netflix', 'uber', 'airbnb', 'tesla', 'adobe', 'salesforce'
    ];
    const company = (job.company || '').toLowerCase();
    if (reputableCompanies.some(c => company.includes(c))) {
      score += 15;
    }

    // Recently posted
    if (job.postedDate) {
      const daysAgo = this.getDaysAgo(job.postedDate);
      if (daysAgo <= 1) score += 10;
      else if (daysAgo <= 7) score += 5;
      else if (daysAgo > 30) score -= 10;
    }

    // Has Easy Apply
    if (job.easyApply || /easy apply/i.test(job.description || '')) {
      score += 5;
    }

    return Math.min(100, Math.max(0, score));
  }

  // Helper: Get days ago from date
  getDaysAgo(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diff = now - date;
      return Math.floor(diff / (1000 * 60 * 60 * 24));
    } catch {
      return 999;
    }
  }

  // Batch match multiple jobs
  matchMultipleJobs(candidate, jobs) {
    return jobs.map(job => ({
      job,
      match: this.calculateMatch(candidate, job),
      quality: this.calculateJobQuality(job)
    })).sort((a, b) => b.match.overallScore - a.match.overallScore);
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.JobMatcher = JobMatcher;
}
