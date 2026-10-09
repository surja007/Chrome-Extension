// Advanced Resume Parser for JobPilot
// Extracts structured data from resume text/PDF

class ResumeParser {
  constructor() {
    this.skillsDatabase = this.loadSkillsDatabase();
  }

  // Load comprehensive skills database
  loadSkillsDatabase() {
    return {
      languages: ['javascript', 'python', 'java', 'c++', 'c#', 'ruby', 'go', 'rust', 'php', 'swift', 'kotlin', 'typescript', 'scala', 'r', 'matlab'],
      frameworks: ['react', 'angular', 'vue', 'svelte', 'next.js', 'nuxt', 'gatsby', 'spring', 'spring boot', 'django', 'flask', 'fastapi', 'express', 'nest.js', 'laravel', 'rails', '.net', 'asp.net'],
      databases: ['mysql', 'postgresql', 'mongodb', 'redis', 'cassandra', 'dynamodb', 'oracle', 'sql server', 'sqlite', 'elasticsearch', 'firebase'],
      cloud: ['aws', 'azure', 'gcp', 'google cloud', 'heroku', 'digitalocean', 'vercel', 'netlify'],
      devops: ['docker', 'kubernetes', 'jenkins', 'gitlab ci', 'github actions', 'terraform', 'ansible', 'ci/cd', 'linux', 'bash'],
      tools: ['git', 'jira', 'postman', 'figma', 'webpack', 'vite', 'maven', 'gradle', 'npm', 'yarn'],
      concepts: ['rest api', 'graphql', 'microservices', 'agile', 'scrum', 'tdd', 'oop', 'design patterns', 'data structures', 'algorithms']
    };
  }

  // Main parse function
  async parseResumeText(text) {
    const parsed = {
      personalInfo: this.extractPersonalInfo(text),
      summary: this.extractSummary(text),
      skills: this.extractSkills(text),
      experience: this.extractExperience(text),
      education: this.extractEducation(text),
      projects: this.extractProjects(text),
      certifications: this.extractCertifications(text),
      achievements: this.extractAchievements(text),
      totalExperienceYears: this.calculateTotalExperience(text),
      keywords: this.extractKeywords(text)
    };

    return parsed;
  }

  // Extract personal information
  extractPersonalInfo(text) {
    const info = {};

    // Email
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    info.email = emailMatch ? emailMatch[0] : '';

    // Phone
    const phonePatterns = [
      /\+?\d{1,3}[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/,
      /\d{10}/,
      /\+91[\s-]?\d{10}/
    ];
    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) {
        info.phone = match[0].trim();
        break;
      }
    }

    // LinkedIn
    const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
    info.linkedin = linkedinMatch ? 'https://' + linkedinMatch[0] : '';

    // GitHub
    const githubMatch = text.match(/github\.com\/[\w-]+/i);
    info.github = githubMatch ? 'https://' + githubMatch[0] : '';

    // Portfolio/Website
    const websiteMatch = text.match(/https?:\/\/[\w.-]+\.\w{2,}/);
    if (websiteMatch && !websiteMatch[0].includes('linkedin') && !websiteMatch[0].includes('github')) {
      info.website = websiteMatch[0];
    }

    // Location
    const locationMatch = text.match(/(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,?\s*(?:India|USA|UK|Canada|Australia)?)/m);
    info.location = locationMatch ? locationMatch[1].trim() : '';

    return info;
  }

  // Extract professional summary
  extractSummary(text) {
    const summaryPatterns = [
      /(?:summary|profile|objective|about me)[:\s]+([\s\S]{50,500}?)(?:\n\n|experience|education|skills)/i,
      /^([\s\S]{50,300}?)(?:\n\n|experience|education|skills)/i
    ];

    for (const pattern of summaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().replace(/\s+/g, ' ');
      }
    }

    return '';
  }

  // Extract skills
  extractSkills(text) {
    const lower = text.toLowerCase();
    const found = new Set();

    // Check all skill categories
    for (const category of Object.values(this.skillsDatabase)) {
      for (const skill of category) {
        const regex = new RegExp('\\b' + skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (regex.test(lower)) {
          found.add(skill);
        }
      }
    }

    // Additional pattern-based extraction
    const skillSection = text.match(/(?:skills|technologies|technical skills)[:\s]+([\s\S]{50,500}?)(?:\n\n|experience|education|projects)/i);
    if (skillSection) {
      const skills = skillSection[1].split(/[,;|\n•·]/);
      skills.forEach(skill => {
        const cleaned = skill.trim().toLowerCase();
        if (cleaned.length > 2 && cleaned.length < 30) {
          found.add(cleaned);
        }
      });
    }

    return Array.from(found);
  }

  // Extract work experience
  extractExperience(text) {
    const experiences = [];
    
    // Find experience section
    const expSection = text.match(/(?:experience|work history|employment)[:\s]+([\s\S]+?)(?:\n\n(?:education|projects|skills|certifications)|$)/i);
    if (!expSection) return experiences;

    const section = expSection[1];
    
    // Split into individual jobs (look for date patterns or company names in caps)
    const jobs = section.split(/\n(?=[A-Z][^a-z\n]{10,}|\d{4}|\w+ \d{4})/);

    for (const job of jobs) {
      if (job.trim().length < 20) continue;

      const exp = {
        company: '',
        title: '',
        location: '',
        startDate: '',
        endDate: '',
        duration: '',
        description: [],
        isCurrent: false
      };

      // Extract dates
      const datePatterns = [
        /(\w+ \d{4})\s*[-–—]\s*(\w+ \d{4}|present)/i,
        /(\d{4})\s*[-–—]\s*(\d{4}|present)/i,
        /(\w+\/\d{4})\s*[-–—]\s*(\w+\/\d{4}|present)/i
      ];

      for (const pattern of datePatterns) {
        const match = job.match(pattern);
        if (match) {
          exp.startDate = match[1];
          exp.endDate = match[2];
          exp.isCurrent = /present|current/i.test(match[2]);
          break;
        }
      }

      // Extract company and title
      const lines = job.split('\n').filter(l => l.trim());
      if (lines.length >= 2) {
        exp.title = lines[0].trim();
        exp.company = lines[1].trim().replace(/[,|]/g, '').trim();
      }

      // Extract bullet points/description
      const bullets = job.match(/[•·\-]\s*(.+)/g);
      if (bullets) {
        exp.description = bullets.map(b => b.replace(/^[•·\-]\s*/, '').trim());
      }

      if (exp.company || exp.title) {
        experiences.push(exp);
      }
    }

    return experiences;
  }

  // Extract education
  extractEducation(text) {
    const education = [];
    
    const eduSection = text.match(/(?:education|academic|qualification)[:\s]+([\s\S]+?)(?:\n\n(?:experience|projects|skills|certifications)|$)/i);
    if (!eduSection) return education;

    const section = eduSection[1];
    const entries = section.split(/\n(?=[A-Z])/);

    for (const entry of entries) {
      if (entry.trim().length < 10) continue;

      const edu = {
        degree: '',
        field: '',
        institution: '',
        location: '',
        year: '',
        gpa: ''
      };

      // Extract degree
      const degreePatterns = [
        /\b(bachelor|master|phd|doctorate|b\.?tech|m\.?tech|b\.?e|m\.?e|bca|mca|b\.?sc|m\.?sc|mba|diploma)\b/i
      ];
      for (const pattern of degreePatterns) {
        const match = entry.match(pattern);
        if (match) {
          edu.degree = match[1];
          break;
        }
      }

      // Extract year
      const yearMatch = entry.match(/\b(19|20)\d{2}\b/);
      edu.year = yearMatch ? yearMatch[0] : '';

      // Extract GPA/Percentage
      const gpaMatch = entry.match(/(\d+\.?\d*)\s*(?:gpa|cgpa|%|percentage)/i);
      edu.gpa = gpaMatch ? gpaMatch[1] : '';

      // Extract institution (usually the longest capitalized phrase)
      const lines = entry.split('\n');
      for (const line of lines) {
        if (line.length > 10 && line.length < 100 && /[A-Z]/.test(line)) {
          edu.institution = line.trim();
          break;
        }
      }

      if (edu.degree || edu.institution) {
        education.push(edu);
      }
    }

    return education;
  }

  // Extract projects
  extractProjects(text) {
    const projects = [];
    
    const projectSection = text.match(/(?:projects|personal projects|work)[:\s]+([\s\S]+?)(?:\n\n(?:experience|education|skills|certifications)|$)/i);
    if (!projectSection) return projects;

    const section = projectSection[1];
    const entries = section.split(/\n(?=[A-Z][^a-z\n]{5,}|\d+\.)/);

    for (const entry of entries) {
      if (entry.trim().length < 20) continue;

      const project = {
        name: '',
        description: '',
        technologies: [],
        link: ''
      };

      const lines = entry.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        project.name = lines[0].trim().replace(/^\d+\.\s*/, '');
      }

      // Extract tech stack
      const techMatch = entry.match(/(?:technologies|tech stack|built with)[:\s]+(.+)/i);
      if (techMatch) {
        project.technologies = techMatch[1].split(/[,;|]/).map(t => t.trim());
      }

      // Extract link
      const linkMatch = entry.match(/(https?:\/\/[^\s]+)/);
      project.link = linkMatch ? linkMatch[1] : '';

      // Description is remaining text
      project.description = entry.replace(/^[^\n]+\n/, '').trim();

      if (project.name) {
        projects.push(project);
      }
    }

    return projects;
  }

  // Extract certifications
  extractCertifications(text) {
    const certs = [];
    
    const certSection = text.match(/(?:certifications?|certificates?|credentials?)[:\s]+([\s\S]+?)(?:\n\n(?:experience|education|projects|skills)|$)/i);
    if (!certSection) return certs;

    const section = certSection[1];
    const entries = section.split(/\n(?=[A-Z•\-\d])/);

    for (const entry of entries) {
      if (entry.trim().length < 5) continue;

      const cert = {
        name: '',
        issuer: '',
        date: '',
        id: ''
      };

      cert.name = entry.split(/\n|[-–—]/)[0].trim().replace(/^[•\-\d.]\s*/, '');

      // Extract issuer
      const issuerMatch = entry.match(/(?:by|from|issued by)\s+([A-Z][^,\n]+)/i);
      cert.issuer = issuerMatch ? issuerMatch[1].trim() : '';

      // Extract date
      const dateMatch = entry.match(/\b(19|20)\d{2}\b/);
      cert.date = dateMatch ? dateMatch[0] : '';

      if (cert.name) {
        certs.push(cert);
      }
    }

    return certs;
  }

  // Extract achievements
  extractAchievements(text) {
    const achievements = [];
    
    const achSection = text.match(/(?:achievements?|awards?|honors?|accomplishments?)[:\s]+([\s\S]+?)(?:\n\n|$)/i);
    if (!achSection) return achievements;

    const section = achSection[1];
    const entries = section.split(/\n(?=[•\-\d])/);

    for (const entry of entries) {
      const cleaned = entry.trim().replace(/^[•\-\d.]\s*/, '');
      if (cleaned.length > 10) {
        achievements.push(cleaned);
      }
    }

    return achievements;
  }

  // Calculate total years of experience
  calculateTotalExperience(text) {
    const expMatches = text.match(/(\d+)[\+]?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/gi);
    
    if (expMatches && expMatches.length > 0) {
      const years = expMatches.map(m => {
        const num = m.match(/\d+/);
        return num ? parseInt(num[0]) : 0;
      });
      return Math.max(...years);
    }

    // Calculate from work history
    const experiences = this.extractExperience(text);
    let totalMonths = 0;

    for (const exp of experiences) {
      if (exp.startDate && exp.endDate) {
        const months = this.calculateMonthsBetween(exp.startDate, exp.endDate);
        totalMonths += months;
      }
    }

    return Math.floor(totalMonths / 12);
  }

  // Helper: Calculate months between dates
  calculateMonthsBetween(start, end) {
    try {
      const startDate = new Date(start);
      const endDate = end.toLowerCase().includes('present') ? new Date() : new Date(end);
      
      const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + 
                     (endDate.getMonth() - startDate.getMonth());
      
      return Math.max(0, months);
    } catch {
      return 0;
    }
  }

  // Extract all keywords for ATS
  extractKeywords(text) {
    const words = text.toLowerCase()
      .split(/\s+/)
      .map(w => w.replace(/[^a-z0-9+#]/g, ''))
      .filter(w => w.length > 2);

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Return keywords with frequency > 2
    return Object.entries(frequency)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, 50);
  }

  // Parse PDF (simplified - requires PDF.js in real implementation)
  async parsePDF(file) {
    // In real implementation, use PDF.js or send to backend
    const text = await this.extractTextFromPDF(file);
    return this.parseResumeText(text);
  }

  // Extract text from PDF file
  async extractTextFromPDF(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Simplified: In production, use PDF.js library
          // For now, just return a message
          resolve('PDF parsing requires PDF.js library. Please paste resume text instead.');
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.ResumeParser = ResumeParser;
}
