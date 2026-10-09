// Advanced Cover Letter Generator for JobPilot
// Generates personalized, ATS-friendly cover letters

class CoverLetterGenerator {
  constructor() {
    // Lazy load to avoid circular dependencies
    this._matcher = null;
  }

  get matcher() {
    if (!this._matcher && typeof JobMatcher !== 'undefined') {
      this._matcher = new JobMatcher();
    }
    return this._matcher;
  }

  // Main generation function
  generate(candidate, job, options = {}) {
    const config = {
      tone: options.tone || 'professional', // professional, friendly, formal
      length: options.length || 'medium', // short, medium, long
      style: options.style || 'standard', // standard, creative, technical
      focusArea: options.focusArea || 'balanced' // skills, experience, culture, balanced
    };

    const analysis = this.analyzeContext(candidate, job);
    const letter = this.buildLetter(candidate, job, analysis, config);

    return {
      content: letter,
      analysis,
      metadata: {
        wordCount: letter.split(/\s+/).length,
        tone: config.tone,
        generatedAt: new Date().toISOString()
      }
    };
  }

  // Analyze context for personalization
  analyzeContext(candidate, job) {
    return {
      matchScore: this.matcher.calculateMatch(candidate, job).overallScore,
      matchingSkills: this.getMatchingSkills(candidate, job),
      relevantExperience: this.getRelevantExperience(candidate, job),
      companyInfo: this.extractCompanyInfo(job),
      jobLevel: this.detectJobLevel(job),
      keyResponsibilities: this.extractKeyResponsibilities(job)
    };
  }

  // Get matching skills between candidate and job
  getMatchingSkills(candidate, job) {
    const candidateSkills = new Set(
      (candidate.skills || []).map(s => s.toLowerCase())
    );
    const jobSkills = this.matcher.extractJobSkills(job.description || '');
    
    return jobSkills.required.filter(s => 
      candidateSkills.has(s.toLowerCase())
    ).slice(0, 5);
  }

  // Get most relevant experience
  getRelevantExperience(candidate, job) {
    const experiences = candidate.experience || [];
    if (experiences.length === 0) return null;

    const jobKeywords = new Set(
      (job.description || '').toLowerCase().split(/\s+/)
    );

    // Score each experience by keyword overlap
    const scored = experiences.map(exp => {
      const expText = JSON.stringify(exp).toLowerCase();
      let score = 0;
      jobKeywords.forEach(keyword => {
        if (expText.includes(keyword)) score++;
      });
      return { exp, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.exp || experiences[0];
  }

  // Extract company information
  extractCompanyInfo(job) {
    return {
      name: job.company || 'your organization',
      industry: this.detectIndustry(job.description || ''),
      values: this.detectCompanyValues(job.description || '')
    };
  }

  // Detect industry from job description
  detectIndustry(description) {
    const industries = {
      'fintech|banking|financial services': 'financial technology',
      'healthcare|medical|health': 'healthcare',
      'ecommerce|retail|online shopping': 'e-commerce',
      'edtech|education|learning platform': 'education technology',
      'gaming|game development': 'gaming',
      'saas|software as a service': 'SaaS',
      'consulting|advisory': 'consulting',
      'ai|machine learning|artificial intelligence': 'artificial intelligence'
    };

    const lower = description.toLowerCase();
    for (const [pattern, industry] of Object.entries(industries)) {
      if (new RegExp(pattern, 'i').test(lower)) {
        return industry;
      }
    }

    return 'technology';
  }

  // Detect company values
  detectCompanyValues(description) {
    const values = [];
    const lower = description.toLowerCase();

    const valueKeywords = {
      'innovation': /innovati(on|ve)|cutting.edge|pioneering/i,
      'collaboration': /collaborat(e|ion|ive)|team|together/i,
      'quality': /quality|excellence|best.in.class/i,
      'growth': /growth|learn|develop|career/i,
      'diversity': /diversity|inclusive|belong/i,
      'impact': /impact|difference|change|transform/i
    };

    for (const [value, pattern] of Object.entries(valueKeywords)) {
      if (pattern.test(lower)) {
        values.push(value);
      }
    }

    return values.slice(0, 3);
  }

  // Detect job level
  detectJobLevel(job) {
    const description = (job.description || '').toLowerCase();
    const title = (job.title || '').toLowerCase();
    const combined = description + ' ' + title;

    if (/senior|lead|principal|staff/i.test(combined)) return 'senior';
    if (/mid.level|intermediate/i.test(combined)) return 'mid';
    if (/junior|entry.level|fresher|graduate/i.test(combined)) return 'junior';
    
    return 'mid';
  }

  // Extract key responsibilities
  extractKeyResponsibilities(job) {
    const description = job.description || '';
    const respSection = description.match(/(?:responsibilities|you will|what you'll do)[:\s]+([\s\S]+?)(?:\n\n|requirements|qualifications|$)/i);
    
    if (respSection) {
      const bullets = respSection[1].match(/[•\-\*]\s*(.+)/g);
      if (bullets && bullets.length > 0) {
        return bullets.slice(0, 3).map(b => 
          b.replace(/^[•\-\*]\s*/, '').trim()
        );
      }
    }

    return [];
  }

  // Build the cover letter
  buildLetter(candidate, job, analysis, config) {
    const sections = {
      header: this.generateHeader(candidate, job, config),
      opening: this.generateOpening(candidate, job, analysis, config),
      body1: this.generateBodyParagraph1(candidate, job, analysis, config),
      body2: this.generateBodyParagraph2(candidate, job, analysis, config),
      closing: this.generateClosing(candidate, job, analysis, config),
      signature: this.generateSignature(candidate, config)
    };

    // Combine sections based on length preference
    if (config.length === 'short') {
      return `${sections.header}\n\n${sections.opening}\n\n${sections.body1}\n\n${sections.closing}\n\n${sections.signature}`;
    } else if (config.length === 'long') {
      return Object.values(sections).join('\n\n');
    } else { // medium
      return `${sections.header}\n\n${sections.opening}\n\n${sections.body1}\n\n${sections.body2}\n\n${sections.closing}\n\n${sections.signature}`;
    }
  }

  // Generate header
  generateHeader(candidate, job, config) {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `${candidate.name || '[Your Name]'}\n${candidate.email || '[Your Email]'} | ${candidate.phone || '[Your Phone]'}\n${candidate.city || ''}\n\n${date}\n\nHiring Manager\n${job.company || 'Company Name'}\n\nRe: Application for ${job.title || 'Position'}`;
  }

  // Generate opening paragraph
  generateOpening(candidate, job, analysis, config) {
    const company = analysis.companyInfo.name;
    const title = job.title || 'this position';
    const matchScore = analysis.matchScore;
    
    if (config.tone === 'friendly') {
      return `Hi! I'm excited to apply for the ${title} position at ${company}. With my background in ${analysis.matchingSkills.slice(0, 2).join(' and ')}, I believe I'd be a great fit for your team.`;
    } else if (config.tone === 'formal') {
      return `Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${title} position at ${company}. With ${candidate.experience || candidate.totalExperienceYears || 'several'} years of experience in ${analysis.matchingSkills.slice(0, 2).join(' and ')}, I am confident in my ability to contribute meaningfully to your organization.`;
    } else { // professional
      return `Dear Hiring Manager,\n\nI am writing to apply for the ${title} position at ${company}. With ${candidate.experience || candidate.totalExperienceYears || 'significant'} years of experience in ${analysis.matchingSkills.slice(0, 3).join(', ')}, I am excited about the opportunity to contribute to your team.`;
    }
  }

  // Generate first body paragraph (skills & experience)
  generateBodyParagraph1(candidate, job, analysis, config) {
    const skills = analysis.matchingSkills.slice(0, 4).join(', ');
    const experience = analysis.relevantExperience;
    const company = experience?.company || 'previous roles';
    
    if (config.focusArea === 'skills') {
      return `My technical expertise includes ${skills}. I have successfully delivered multiple projects using these technologies, consistently meeting deadlines and exceeding quality standards. My strong problem-solving abilities and attention to detail enable me to tackle complex challenges effectively.`;
    } else if (config.focusArea === 'experience') {
      return `In my ${experience?.isCurrent ? 'current' : 'previous'} role at ${company}, I gained extensive experience with ${skills}. I have demonstrated the ability to deliver high-quality results while collaborating effectively with cross-functional teams. My track record includes successfully completing projects that directly contributed to business objectives.`;
    } else { // balanced
      return `Throughout my career, I have developed strong expertise in ${skills}. ${experience ? `At ${company}, I successfully delivered projects that combined technical excellence with business impact.` : 'I have consistently delivered high-quality solutions across various projects.'} My approach combines technical proficiency with effective communication and collaboration skills.`;
    }
  }

  // Generate second body paragraph (culture fit & motivation)
  generateBodyParagraph2(candidate, job, analysis, config) {
    const company = analysis.companyInfo.name;
    const industry = analysis.companyInfo.industry;
    const values = analysis.companyInfo.values;

    if (config.focusArea === 'culture') {
      return `I am particularly drawn to ${company}'s commitment to ${values.join(', ')}. ${values.includes('innovation') ? 'I thrive in innovative environments and enjoy staying current with emerging technologies.' : ''} ${values.includes('collaboration') ? 'I believe in the power of collaborative teamwork to achieve exceptional results.' : ''} I am excited about the opportunity to contribute to your mission in the ${industry} space.`;
    } else {
      return `What excites me most about this opportunity is ${company}'s position in ${industry}. I am eager to bring my technical skills and collaborative approach to contribute to your team's success. I am particularly interested in ${values[0] || 'innovation'} and believe my experience aligns well with your goals.`;
    }
  }

  // Generate closing paragraph
  generateClosing(candidate, job, analysis, config) {
    const company = analysis.companyInfo.name;
    
    if (config.tone === 'friendly') {
      return `I'd love the opportunity to discuss how I can contribute to ${company}. Thanks for considering my application, and I look forward to hearing from you!`;
    } else if (config.tone === 'formal') {
      return `I would welcome the opportunity to discuss how my qualifications align with ${company}'s needs. Thank you for considering my application. I look forward to the possibility of contributing to your esteemed organization.`;
    } else { // professional
      return `I would welcome the opportunity to discuss how my background and skills can contribute to ${company}'s continued success. Thank you for considering my application, and I look forward to the possibility of speaking with you.`;
    }
  }

  // Generate signature
  generateSignature(candidate, config) {
    if (config.tone === 'friendly') {
      return `Best regards,\n${candidate.name || '[Your Name]'}`;
    } else if (config.tone === 'formal') {
      return `Respectfully,\n${candidate.name || '[Your Name]'}`;
    } else { // professional
      return `Sincerely,\n${candidate.name || '[Your Name]'}`;
    }
  }

  // Generate multiple variations
  generateVariations(candidate, job) {
    const variations = [];

    const configs = [
      { tone: 'professional', length: 'medium', name: 'Professional (Recommended)' },
      { tone: 'friendly', length: 'short', name: 'Friendly & Concise' },
      { tone: 'formal', length: 'long', name: 'Formal & Detailed' },
      { tone: 'professional', length: 'short', name: 'Professional & Brief' }
    ];

    configs.forEach(config => {
      const result = this.generate(candidate, job, config);
      variations.push({
        name: config.name,
        content: result.content,
        wordCount: result.metadata.wordCount,
        config
      });
    });

    return variations;
  }

  // Customize specific section
  customizeSection(candidate, job, section, userInput) {
    // Allow users to customize specific sections
    const analysis = this.analyzeContext(candidate, job);
    const config = { tone: 'professional', length: 'medium' };

    const sections = {
      opening: userInput || this.generateOpening(candidate, job, analysis, config),
      body1: this.generateBodyParagraph1(candidate, job, analysis, config),
      body2: this.generateBodyParagraph2(candidate, job, analysis, config),
      closing: this.generateClosing(candidate, job, analysis, config)
    };

    if (userInput && section) {
      sections[section] = userInput;
    }

    return sections;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.CoverLetterGenerator = CoverLetterGenerator;
}
