// AI Engine for JobPilot Extension
// Handles resume parsing, job matching, cover letters, form detection

class AIEngine {
  constructor() {
    this.commonSkills = [
      'python', 'java', 'javascript', 'typescript', 'react', 'node', 'angular', 'vue',
      'sql', 'postgres', 'mysql', 'mongodb', 'aws', 'azure', 'docker', 'kubernetes',
      'spring', 'django', 'flask', 'fastapi', 'git', 'ci/cd', 'html', 'css', 'rest api'
    ];
  }

  // Extract structured data from resume text
  parseResume(text) {
    const lower = text.toLowerCase();
    
    // Extract email
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const email = emailMatch ? emailMatch[0] : '';
    
    // Extract phone
    const phoneMatch = text.match(/\+?\d[\d\s-]{8,13}\d/);
    const phone = phoneMatch ? phoneMatch[0] : '';
    
    // Extract skills
    const skills = this.commonSkills.filter(skill => 
      new RegExp('\\b' + skill + '\\b', 'i').test(text)
    );
    
    // Extract experience years
    const expMatch = lower.match(/(\d+)[\+]?\s*(?:years?|yrs?)/);
    const experience = expMatch ? parseInt(expMatch[1]) : 0;
    
    // Extract education
    const education = [];
    const eduKeywords = ['bachelor', 'master', 'b.tech', 'm.tech', 'bca', 'mca', 'phd'];
    eduKeywords.forEach(edu => {
      if (lower.includes(edu)) education.push(edu);
    });
    
    return {
      email,
      phone,
      skills,
      experience,
      education,
      fullText: text.substring(0, 5000)
    };
  }

  // Analyze job description and extract requirements
  analyzeJob(jobDesc, jobTitle) {
    const lower = jobDesc.toLowerCase();
    
    // Extract required skills
    const requiredSkills = this.commonSkills.filter(skill => 
      lower.includes(skill)
    );
    
    // Extract experience requirement
    const expMatch = lower.match(/(\d+)[\+]?\s*(?:years?|yrs?)/);
    const minExperience = expMatch ? parseInt(expMatch[1]) : 0;
    
    // Extract salary if mentioned
    let salary = null;
    const salaryPatterns = [
      /\$(\d+)k?\s*-\s*\$?(\d+)k?/i,
      /₹(\d+)\s*-\s*₹?(\d+)\s*lpa/i,
      /(\d+)\s*-\s*(\d+)\s*lpa/i
    ];
    for (const pattern of salaryPatterns) {
      const match = jobDesc.match(pattern);
      if (match) {
        salary = `${match[1]}-${match[2]}`;
        break;
      }
    }
    
    // Detect remote/hybrid
    const isRemote = /remote|work from home|wfh/i.test(lower);
    const isHybrid = /hybrid/i.test(lower);
    
    return {
      requiredSkills,
      minExperience,
      salary,
      isRemote,
      isHybrid,
      title: jobTitle
    };
  }

  // Calculate match score between candidate and job
  calculateMatch(candidate, job) {
    let skillScore = 0;
    let expScore = 0;
    
    // Skill matching
    const candidateSkills = new Set(candidate.skills || []);
    const jobSkills = job.requiredSkills || [];
    const matchingSkills = jobSkills.filter(skill => candidateSkills.has(skill));
    
    if (jobSkills.length > 0) {
      skillScore = (matchingSkills.length / jobSkills.length) * 100;
    } else {
      skillScore = 50; // Default if no skills detected
    }
    
    // Experience matching
    const candidateExp = candidate.experience || 0;
    const requiredExp = job.minExperience || 0;
    
    if (requiredExp === 0) {
      expScore = 100;
    } else if (candidateExp >= requiredExp) {
      expScore = 100;
    } else {
      expScore = (candidateExp / requiredExp) * 100;
    }
    
    // Overall score (weighted)
    const overallScore = Math.round(skillScore * 0.7 + expScore * 0.3);
    
    return {
      overallScore,
      skillScore: Math.round(skillScore),
      expScore: Math.round(expScore),
      matchingSkills,
      missingSkills: jobSkills.filter(s => !candidateSkills.has(s))
    };
  }

  // Generate cover letter
  generateCoverLetter(candidate, job, tone = 'professional') {
    const name = candidate.name || 'Candidate';
    const company = job.company || 'your company';
    const title = job.title || 'the position';
    const matchingSkills = this.calculateMatch(candidate, job).matchingSkills.slice(0, 5);
    
    let intro, body, closing;
    
    if (tone === 'friendly') {
      intro = `Hi! I'm ${name}, and I'm excited to apply for the ${title} position at ${company}.`;
      closing = `Looking forward to hearing from you!\n\nBest regards,\n${name}`;
    } else if (tone === 'formal') {
      intro = `Dear Hiring Manager,\n\nI am writing to express my formal interest in the ${title} position at ${company}.`;
      closing = `Thank you for your consideration.\n\nRespectfully,\n${name}`;
    } else { // professional
      intro = `Dear Hiring Manager,\n\nI am writing to apply for the ${title} position at ${company}.`;
      closing = `Thank you for considering my application. I look forward to discussing this opportunity further.\n\nSincerely,\n${name}`;
    }
    
    const skillsText = matchingSkills.length > 0 
      ? matchingSkills.join(', ')
      : 'relevant technologies';
    
    body = `\nWith ${candidate.experience || 0}+ years of experience in ${skillsText}, I am confident I would be a valuable addition to your team.\n\nMy background includes successful projects and consistent delivery of high-quality results. I am particularly drawn to ${company}'s innovative approach and would welcome the opportunity to contribute to your mission.\n\nI have attached my resume for your review and would appreciate the opportunity to discuss how my skills align with your needs.\n`;
    
    return intro + body + closing;
  }

  // Detect question type from form field
  detectQuestionType(fieldInfo) {
    const text = (fieldInfo.label + ' ' + fieldInfo.name + ' ' + fieldInfo.placeholder).toLowerCase();
    
    const patterns = {
      firstName: /first.*name|fname/,
      lastName: /last.*name|lname|surname/,
      fullName: /full.*name|^name$|your.*name/,
      email: /e-?mail/,
      phone: /phone|mobile|contact.*number/,
      linkedin: /linkedin|linked.*in/,
      city: /city|location|where.*located/,
      experience: /experience|years.*experience|yoe/,
      salary: /salary|compensation|expected.*salary/,
      currentCompany: /current.*company|employer|organization/,
      coverLetter: /cover.*letter|why.*apply|tell.*us|message/,
      visa: /visa|work.*authorization|authorized.*work/,
      relocation: /relocate|relocation|willing.*move/,
      startDate: /start.*date|available|notice.*period|joining/,
      education: /education|degree|university|college/,
      website: /website|portfolio|github|personal.*site/
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) return type;
    }
    
    return 'unknown';
  }

  // Get answer for detected question type
  getAnswerForQuestion(questionType, candidate) {
    const answers = {
      firstName: candidate.name ? candidate.name.split(' ')[0] : '',
      lastName: candidate.name ? candidate.name.split(' ').slice(1).join(' ') : '',
      fullName: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      linkedin: candidate.linkedin || '',
      city: candidate.city || '',
      experience: candidate.experience ? candidate.experience.toString() : '',
      currentCompany: candidate.company || '',
      coverLetter: candidate.coverLetter || '',
      website: candidate.linkedin || candidate.github || '',
      education: candidate.education ? candidate.education.join(', ') : ''
    };
    
    return answers[questionType] || '';
  }

  // Detect duplicate jobs
  isDuplicate(newJob, existingJobs) {
    for (const existing of existingJobs) {
      // Same URL
      if (newJob.url && newJob.url === existing.url) {
        return true;
      }
      
      // Same company + similar title
      if (newJob.company === existing.company && 
          this.similarity(newJob.title, existing.title) > 0.8) {
        return true;
      }
    }
    return false;
  }

  // Calculate string similarity (Jaccard)
  similarity(s1, s2) {
    if (!s1 || !s2) return 0;
    const set1 = new Set(s1.toLowerCase().split(/\s+/));
    const set2 = new Set(s2.toLowerCase().split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }

  // Calculate job quality score
  calculateJobQuality(job) {
    let score = 60; // Base score
    
    // Has salary mentioned
    if (job.salary) score += 10;
    
    // Remote/Hybrid
    if (job.isRemote) score += 10;
    if (job.isHybrid) score += 5;
    
    // Reputable companies
    const reputable = ['google', 'microsoft', 'amazon', 'facebook', 'meta', 'apple', 'netflix'];
    if (reputable.some(c => job.company?.toLowerCase().includes(c))) {
      score += 15;
    }
    
    // Recently posted (if we have this info)
    if (job.postedHoursAgo && job.postedHoursAgo < 24) {
      score += 5;
    }
    
    return Math.min(100, score);
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIEngine;
}
