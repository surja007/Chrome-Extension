// Answer Memory System - Remember and reuse answers

class AnswerMemory {
  constructor() {
    this.answers = new Map();
    this.questionPatterns = [];
  }

  async initialize() {
    const data = await chrome.storage.local.get(['savedAnswers', 'questionPatterns']);
    this.answers = new Map(Object.entries(data.savedAnswers || {}));
    this.questionPatterns = data.questionPatterns || this.getDefaultPatterns();
  }

  getDefaultPatterns() {
    return [
      {
        pattern: /why.*want.*work|why.*interested|why.*apply|motivation/i,
        category: 'motivation',
        key: 'why_company'
      },
      {
        pattern: /notice.*period|join|available|start.*date/i,
        category: 'availability',
        key: 'notice_period'
      },
      {
        pattern: /current.*salary|expected.*salary|compensation|ctc/i,
        category: 'compensation',
        key: 'salary_expectation'
      },
      {
        pattern: /relocate|willing.*move|open.*relocation/i,
        category: 'relocation',
        key: 'relocation'
      },
      {
        pattern: /visa.*status|authorized.*work|work.*permit|sponsorship/i,
        category: 'visa',
        key: 'work_authorization'
      },
      {
        pattern: /gender|disability|veteran|race|ethnicity/i,
        category: 'demographics',
        key: 'demographics'
      },
      {
        pattern: /linkedin|github|portfolio|website/i,
        category: 'links',
        key: 'professional_links'
      },
      {
        pattern: /years.*experience|how.*long/i,
        category: 'experience',
        key: 'years_experience'
      }
    ];
  }

  findMatchingPattern(question) {
    const normalized = question.toLowerCase().trim();
    
    for (const pattern of this.questionPatterns) {
      if (pattern.pattern.test(normalized)) {
        return pattern;
      }
    }
    
    return null;
  }

  async getAnswer(question, context = {}) {
    // First, try exact match
    if (this.answers.has(question)) {
      return this.answers.get(question);
    }

    // Try pattern matching
    const pattern = this.findMatchingPattern(question);
    if (pattern) {
      const answer = this.answers.get(pattern.key);
      if (answer) return answer;
    }

    // Generate smart answer based on context
    return this.generateSmartAnswer(question, pattern, context);
  }

  generateSmartAnswer(question, pattern, context) {
    if (!pattern) return null;

    const templates = {
      motivation: `I am excited about this opportunity because it aligns with my career goals and expertise. With ${context.experience} years of experience in ${context.jobRole}, I believe I can contribute significantly to your team.`,
      
      notice_period: `I can join in ${context.noticePeriod || '30 days'}.`,
      
      salary_expectation: context.expectedSalary || 'Open to discussion based on the role and responsibilities',
      
      relocation: context.willingToRelocate ? 'Yes, I am open to relocation' : 'I prefer remote or local opportunities',
      
      work_authorization: context.workAuthorization || 'I am authorized to work',
      
      years_experience: `${context.experience} years`,
      
      demographics: 'Prefer not to answer',
      
      professional_links: context.linkedin || ''
    };

    return templates[pattern.category] || null;
  }

  async saveAnswer(question, answer, category = null) {
    // Save exact question
    this.answers.set(question, answer);

    // If category provided, save as pattern answer too
    if (category) {
      this.answers.set(category, answer);
    }

    await this.persist();
  }

  async learnFromAnswer(question, answer) {
    // Check if this is a new pattern
    const existing = this.findMatchingPattern(question);
    
    if (!existing) {
      // Could be a new pattern - store for manual review
      await this.saveAnswer(question, answer);
    } else {
      // Update existing pattern answer
      await this.saveAnswer(question, answer, existing.key);
    }
  }

  async getAllAnswers() {
    return Object.fromEntries(this.answers);
  }

  async updateAnswer(key, value) {
    this.answers.set(key, value);
    await this.persist();
  }

  async deleteAnswer(key) {
    this.answers.delete(key);
    await this.persist();
  }

  async clearAll() {
    this.answers.clear();
    await this.persist();
  }

  async persist() {
    await chrome.storage.local.set({
      savedAnswers: Object.fromEntries(this.answers),
      questionPatterns: this.questionPatterns
    });
  }

  // Export/Import functionality
  exportAnswers() {
    return JSON.stringify({
      answers: Object.fromEntries(this.answers),
      patterns: this.questionPatterns,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  async importAnswers(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.answers = new Map(Object.entries(data.answers || {}));
      this.questionPatterns = data.patterns || this.questionPatterns;
      await this.persist();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

if (typeof window !== 'undefined') {
  window.AnswerMemory = AnswerMemory;
}
