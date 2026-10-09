// AI Resume Optimizer for JobPilot
// Tailors resumes for specific jobs with ATS optimization

class ResumeOptimizer {
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

  // Main optimization function
  async optimizeForJob(candidate, job) {
    const analysis = {
      originalResume: candidate,
      jobRequirements: this.analyzeJobRequirements(job),
      optimization: this.generateOptimization(candidate, job),
      atsScore: this.calculateATSScore(candidate, job),
      recommendations: []
    };

    // Generate tailored resume
    const tailored = this.generateTailoredResume(candidate, job, analysis);
    
    return {
      original: candidate,
      tailored,
      analysis,
      improvements: this.compareResumes(candidate, tailored, job)
    };
  }

  // Analyze job requirements
  analyzeJobRequirements(job) {
    const description = (job.description || '').toLowerCase();
    
    return {
      keywords: this.extractKeywords(job.description || ''),
      requiredSkills: this.matcher.extractJobSkills(job.description || '').required,
      preferredSkills: this.matcher.extractJobSkills(job.description || '').preferred,
      experience: this.matcher.extractExperienceRequirement(job.description || ''),
      education: this.matcher.extractEducationRequirement(job.description || ''),
      responsibilities: this.extractResponsibilities(job.description || ''),
      companyInfo: {
        name: job.company || '',
        industry: this.detectIndustry(job.description || ''),
        size: this.detectCompanySize(job.description || '')
      }
    };
  }

  // Extract keywords for ATS
  extractKeywords(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s+-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const stopWords = new Set(['the', 'and', 'for', 'with', 'are', 'you', 'this', 'that', 'from', 'will', 'have', 'can', 'our', 'your', 'about']);
    const filtered = words.filter(w => !stopWords.has(w));

    const frequency = {};
    filtered.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }));
  }

  // Extract job responsibilities
  extractResponsibilities(description) {
    const responsibilities = [];
    
    // Find responsibilities section
    const respSection = description.match(/(?:responsibilities|you will|what you'll do)[:\s]+([\s\S]+?)(?:\n\n|requirements|qualifications|$)/i);
    
    if (respSection) {
      const bullets = respSection[1].match(/[•\-\*]\s*(.+)/g);
      if (bullets) {
        return bullets.map(b => b.replace(/^[•\-\*]\s*/, '').trim());
      }
    }

    return responsibilities;
  }

  // Detect industry from job description
  detectIndustry(description) {
    const industries = {
      'fintech|banking|finance': 'Finance',
      'healthcare|medical|hospital': 'Healthcare',
      'ecommerce|retail|shopping': 'E-commerce',
      'edtech|education|learning': 'Education',
      'gaming|game|esports': 'Gaming',
      'saas|software|platform': 'SaaS',
      'consulting': 'Consulting',
      'manufacturing': 'Manufacturing'
    };

    const lower = description.toLowerCase();
    for (const [pattern, industry] of Object.entries(industries)) {
      if (new RegExp(pattern, 'i').test(lower)) {
        return industry;
      }
    }

    return 'Technology';
  }

  // Detect company size
  detectCompanySize(description) {
    if (/startup|early stage/i.test(description)) return 'Startup';
    if (/enterprise|large company|fortune/i.test(description)) return 'Enterprise';
    return 'Unknown';
  }

  // Generate optimization recommendations
  generateOptimization(candidate, job) {
    const recommendations = [];
    const jobKeywords = new Set(
      this.extractKeywords(job.description || '').map(k => k.word)
    );
    const resumeText = JSON.stringify(candidate).toLowerCase();

    // Missing keywords
    const missingKeywords = Array.from(jobKeywords).filter(keyword => 
      !resumeText.includes(keyword)
    ).slice(0, 10);

    if (missingKeywords.length > 0) {
      recommendations.push({
        type: 'keywords',
        priority: 'high',
        message: `Add these keywords: ${missingKeywords.join(', ')}`,
        keywords: missingKeywords
      });
    }

    // Skills optimization
    const requiredSkills = this.matcher.extractJobSkills(job.description || '').required;
    const candidateSkills = new Set((candidate.skills || []).map(s => s.toLowerCase()));
    const missingSkills = requiredSkills.filter(s => !candidateSkills.has(s.toLowerCase()));

    if (missingSkills.length > 0) {
      recommendations.push({
        type: 'skills',
        priority: 'high',
        message: `Highlight these skills if you have them: ${missingSkills.join(', ')}`,
        skills: missingSkills
      });
    }

    // Summary optimization
    if (!candidate.summary || candidate.summary.length < 100) {
      recommendations.push({
        type: 'summary',
        priority: 'medium',
        message: 'Add a professional summary targeting this role'
      });
    }

    // Experience quantification
    const hasNumbers = /\d+%|\d+\+|increased|decreased|improved/i.test(resumeText);
    if (!hasNumbers) {
      recommendations.push({
        type: 'quantify',
        priority: 'medium',
        message: 'Add quantifiable achievements (numbers, percentages, metrics)'
      });
    }

    return recommendations;
  }

  // Generate tailored resume
  generateTailoredResume(candidate, job, analysis) {
    const tailored = JSON.parse(JSON.stringify(candidate)); // Deep clone

    // Optimize summary
    tailored.summary = this.generateTailoredSummary(candidate, job);

    // Reorder and enhance skills
    tailored.skills = this.prioritizeSkills(candidate.skills || [], analysis.jobRequirements.requiredSkills);

    // Enhance experience bullets
    if (tailored.experience) {
      tailored.experience = tailored.experience.map(exp => ({
        ...exp,
        description: this.enhanceExperienceBullets(exp.description || [], job, analysis)
      }));
    }

    // Add job-specific keywords
    tailored._optimizedFor = {
      jobTitle: job.title,
      company: job.company,
      optimizedDate: new Date().toISOString(),
      targetKeywords: analysis.jobRequirements.keywords.slice(0, 10).map(k => k.word)
    };

    return tailored;
  }

  // Generate tailored summary
  generateTailoredSummary(candidate, job) {
    const experience = candidate.experience || candidate.totalExperienceYears || 0;
    const title = job.title || 'this position';
    const company = job.company || 'your organization';
    
    const topSkills = (candidate.skills || []).slice(0, 5).join(', ');
    
    const summaries = [
      `Results-driven ${title} with ${experience}+ years of experience in ${topSkills}. Proven track record of delivering high-quality solutions and driving business value. Eager to contribute to ${company}'s success.`,
      
      `Experienced professional with ${experience}+ years specializing in ${topSkills}. Strong problem-solver with expertise in building scalable applications. Seeking to leverage skills in the ${title} role at ${company}.`,
      
      `${experience}+ years of hands-on experience in ${topSkills}. Passionate about technology and committed to continuous learning. Looking to bring technical expertise and collaborative mindset to ${company}.`
    ];

    return summaries[0]; // Return first template
  }

  // Prioritize skills based on job requirements
  prioritizeSkills(skills, requiredSkills) {
    const skillSet = new Set(skills.map(s => s.toLowerCase()));
    const required = requiredSkills.map(s => s.toLowerCase());
    
    // Put matching required skills first
    const matching = skills.filter(s => required.includes(s.toLowerCase()));
    const others = skills.filter(s => !required.includes(s.toLowerCase()));
    
    return [...matching, ...others];
  }

  // Enhance experience bullets with job-specific optimization
  enhanceExperienceBullets(bullets, job, analysis) {
    if (!Array.isArray(bullets) || bullets.length === 0) return bullets;

    const keywords = new Set(analysis.jobRequirements.keywords.map(k => k.word));
    const enhanced = [];

    for (const bullet of bullets) {
      let enhancedBullet = bullet;

      // Check relevance to job
      let relevance = 0;
      keywords.forEach(keyword => {
        if (bullet.toLowerCase().includes(keyword)) {
          relevance++;
        }
      });

      // Only include highly relevant bullets or keep all if few bullets
      if (relevance > 0 || bullets.length <= 3) {
        enhanced.push({
          text: enhancedBullet,
          relevance
        });
      }
    }

    // Sort by relevance and return top bullets
    return enhanced
      .sort((a, b) => b.relevance - a.relevance)
      .map(b => b.text)
      .slice(0, 5); // Keep top 5 most relevant
  }

  // Calculate ATS score
  calculateATSScore(candidate, job) {
    let score = 0;
    const checks = [];

    // Keyword density
    const jobKeywords = this.extractKeywords(job.description || '');
    const resumeText = JSON.stringify(candidate).toLowerCase();
    const matchingKeywords = jobKeywords.filter(k => resumeText.includes(k.word));
    const keywordScore = (matchingKeywords.length / jobKeywords.length) * 100;
    
    checks.push({
      name: 'Keyword Match',
      score: Math.round(keywordScore),
      passed: keywordScore >= 60
    });

    // Required skills
    const requiredSkills = this.matcher.extractJobSkills(job.description || '').required;
    const candidateSkills = new Set((candidate.skills || []).map(s => s.toLowerCase()));
    const skillMatches = requiredSkills.filter(s => candidateSkills.has(s.toLowerCase()));
    const skillScore = requiredSkills.length > 0 ? (skillMatches.length / requiredSkills.length) * 100 : 100;
    
    checks.push({
      name: 'Required Skills',
      score: Math.round(skillScore),
      passed: skillScore >= 70
    });

    // Experience level
    const expRequirement = this.matcher.extractExperienceRequirement(job.description || '');
    const candidateExp = candidate.experience || candidate.totalExperienceYears || 0;
    let expScore = 100;
    if (expRequirement.min && candidateExp < expRequirement.min) {
      expScore = Math.max(50, (candidateExp / expRequirement.min) * 100);
    }
    
    checks.push({
      name: 'Experience Level',
      score: Math.round(expScore),
      passed: expScore >= 80
    });

    // Education
    const eduRequired = this.matcher.extractEducationRequirement(job.description || '');
    const hasEducation = (candidate.education || []).length > 0;
    const eduScore = eduRequired.length === 0 || hasEducation ? 100 : 70;
    
    checks.push({
      name: 'Education',
      score: eduScore,
      passed: eduScore >= 70
    });

    // Formatting
    checks.push({
      name: 'Readable Format',
      score: 100,
      passed: true
    });

    // Contact info
    const hasContact = candidate.email && candidate.phone;
    checks.push({
      name: 'Contact Information',
      score: hasContact ? 100 : 50,
      passed: hasContact
    });

    // Calculate overall score
    const overallScore = checks.reduce((sum, check) => sum + check.score, 0) / checks.length;

    return {
      overallScore: Math.round(overallScore),
      checks,
      passed: checks.filter(c => c.passed).length,
      total: checks.length
    };
  }

  // Compare original vs tailored
  compareResumes(original, tailored, job) {
    const originalScore = this.calculateATSScore(original, job);
    const tailoredScore = this.calculateATSScore(tailored, job);

    return {
      before: originalScore,
      after: tailoredScore,
      improvement: tailoredScore.overallScore - originalScore.overallScore,
      summary: this.generateComparisonSummary(originalScore, tailoredScore)
    };
  }

  // Generate comparison summary
  generateComparisonSummary(before, after) {
    const improvement = after.overallScore - before.overallScore;
    
    if (improvement >= 20) {
      return `🚀 Significant improvement! ATS score increased by ${improvement} points.`;
    } else if (improvement >= 10) {
      return `✓ Good improvement! ATS score increased by ${improvement} points.`;
    } else if (improvement > 0) {
      return `~ Minor improvement. ATS score increased by ${improvement} points.`;
    } else {
      return `Original resume already well-optimized for this job.`;
    }
  }

  // Generate resume as text (for ATS submission)
  generateResumeText(resume) {
    let text = '';

    // Personal Info
    text += `${resume.name || ''}\n`;
    if (resume.email) text += `${resume.email} | `;
    if (resume.phone) text += `${resume.phone} | `;
    if (resume.location) text += `${resume.location}`;
    text += '\n\n';

    // Links
    if (resume.linkedin) text += `LinkedIn: ${resume.linkedin}\n`;
    if (resume.github) text += `GitHub: ${resume.github}\n`;
    if (resume.website) text += `Portfolio: ${resume.website}\n`;
    text += '\n';

    // Summary
    if (resume.summary) {
      text += `PROFESSIONAL SUMMARY\n${resume.summary}\n\n`;
    }

    // Skills
    if (resume.skills && resume.skills.length > 0) {
      text += `TECHNICAL SKILLS\n${resume.skills.join(' • ')}\n\n`;
    }

    // Experience
    if (resume.experience && resume.experience.length > 0) {
      text += `PROFESSIONAL EXPERIENCE\n\n`;
      resume.experience.forEach(exp => {
        text += `${exp.title || ''}\n`;
        text += `${exp.company || ''} | ${exp.startDate || ''} - ${exp.endDate || ''}\n`;
        if (exp.description && exp.description.length > 0) {
          exp.description.forEach(bullet => {
            text += `• ${bullet}\n`;
          });
        }
        text += '\n';
      });
    }

    // Education
    if (resume.education && resume.education.length > 0) {
      text += `EDUCATION\n\n`;
      resume.education.forEach(edu => {
        text += `${edu.degree || ''} ${edu.field || ''}\n`;
        text += `${edu.institution || ''} | ${edu.year || ''}\n`;
        if (edu.gpa) text += `GPA: ${edu.gpa}\n`;
        text += '\n';
      });
    }

    // Projects
    if (resume.projects && resume.projects.length > 0) {
      text += `PROJECTS\n\n`;
      resume.projects.forEach(project => {
        text += `${project.name || ''}\n`;
        if (project.description) text += `${project.description}\n`;
        if (project.technologies && project.technologies.length > 0) {
          text += `Technologies: ${project.technologies.join(', ')}\n`;
        }
        text += '\n';
      });
    }

    // Certifications
    if (resume.certifications && resume.certifications.length > 0) {
      text += `CERTIFICATIONS\n`;
      resume.certifications.forEach(cert => {
        text += `• ${cert.name || cert} - ${cert.issuer || ''} (${cert.date || ''})\n`;
      });
      text += '\n';
    }

    return text;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ResumeOptimizer = ResumeOptimizer;
}
