/**
 * 模板引擎
 * 渲染讲义内容到 HTML 模板
 */

const TemplateEngine = {
  // 模板数据
  templates: {},

  /**
   * 加载模板
   * @param {string} name - 模板名称
   * @returns {Promise<string>} - 模板 HTML
   */
  async loadTemplate(name) {
    if (this.templates[name]) {
      return this.templates[name];
    }

    try {
      const response = await fetch(`assets/templates/${name}.html`);
      if (!response.ok) throw new Error(`Template ${name} not found`);
      const html = await response.text();
      this.templates[name] = html;
      return html;
    } catch (error) {
      console.warn('Failed to load template:', error);
      // 返回默认模板
      return this.getDefaultTemplate();
    }
  },

  /**
   * 默认模板
   * @returns {string}
   */
  getDefaultTemplate() {
    return `
      <div class="handout-content">
        <h1 class="title">{{topic}}</h1>
        <div class="divider"></div>
        <div class="introduction">{{introduction}}</div>
        <div class="section-title">知识讲解</div>
        <div class="explanation">{{explanation}}</div>
        <div class="section-title">例题</div>
        <div class="examples">{{examples}}</div>
        <div class="section-title">练习题</div>
        <div class="practice">{{practice}}</div>
        <div class="section-title">总结</div>
        <div class="summary">{{summary}}</div>
      </div>
    `;
  },

  /**
   * 渲染模板
   * @param {string} templateName - 模板名称
   * @param {object} data - 数据
   * @param {string} theme - 主题
   * @returns {Promise<string>} - 渲染后的 HTML
   */
  async render(templateName, data, theme = 'blue') {
    const template = await this.loadTemplate(templateName);
    
    // 准备数据
    const prepared = this.prepareData(data);
    
    // 替换占位符
    let html = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return prepared[key] || '';
    });

    // 设置主题
    html = `<div data-theme="${theme}">${html}</div>`;
    
    return html;
  },

  /**
   * 准备数据
   * @param {object} data - 原始数据
   * @returns {object} - 处理后的数据
   */
  prepareData(data) {
    const result = {
      topic: data.topic || '未命名知识点',
      subject: data.subject || '学科',
      grade: data.grade || '年级',
      difficulty: this.translateDifficulty(data.difficulty || '基础'),
      introduction: this.formatText(data.introduction || ''),
      explanation: this.formatText(data.explanation || ''),
      summary: this.formatText(data.summary || ''),
      keyVocabulary: this.formatVocabulary(data.keyVocabulary || []),
      commonMisconceptions: this.formatMisconceptions(data.commonMisconceptions || []),
      learningObjectives: this.formatObjectives(data.learningObjectives || []),
      keyPoints: this.formatKeyPoints(data.keyPoints || []),
      difficultPoints: this.formatList(data.difficultPoints || []),
      examples: this.formatExamples(data.examples || []),
      practice: this.formatPractice(data.practice || []),
      // 特定模板字段
      formula: data.formula || '暂无公式',
      formulaDesc: data.formulaDesc || '',
      answer: data.answer || '详见解析',
      discussion: data.discussion || '请讨论本节课的核心问题',
      materials: data.materials || '根据实验内容准备相应材料'
    };

    return result;
  },

  /**
   * 翻译难度
   * @param {string} difficulty - 难度英文
   * @returns {string}
   */
  translateDifficulty(difficulty) {
    const map = {
      'basic': '基础',
      'advanced': '进阶',
      'extension': '拓展',
      '基础': '基础',
      '进阶': '进阶',
      '拓展': '拓展'
    };
    return map[difficulty] || '基础';
  },

  /**
   * 格式化文本
   * @param {string} text - 文本
   * @returns {string}
   */
  formatText(text) {
    if (!text) return '<p>暂无内容</p>';
    
    // 将换行转为段落
    return text
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
  },

  /**
   * 格式化列表
   * @param {array} items - 列表项
   * @returns {string}
   */
  formatList(items) {
    if (!items || items.length === 0) return '<p>暂无</p>';
    return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
  },

  /**
   * 格式化核心词汇
   * @param {array} items - 词汇列表
   * @returns {string}
   */
  formatVocabulary(items) {
    if (!items || items.length === 0) return '<span class="vocab-item">暂无</span>';
    return items.map(item => `<span class="vocab-item">${item}</span>`).join('');
  },

  /**
   * 格式化重点知识
   * @param {array} items - 重点列表
   * @returns {string}
   */
  formatKeyPoints(items) {
    if (!items || items.length === 0) return '<ul class="key-point-list"><li>暂无</li></ul>';
    return `<ul class="key-point-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
  },

  /**
   * 格式化例题
   * @param {array} examples - 例题列表
   * @returns {string}
   */
  formatExamples(examples) {
    if (!examples || examples.length === 0) return '<p>暂无例题</p>';
    
    return examples.map((ex, i) => `
      <div class="example-box">
        <div class="example-header">
          <span class="badge">例题 ${i + 1}</span>
          <span class="example-title">${ex.title || ''}</span>
        </div>
        <div class="example-problem">
          <strong>题目：</strong>${ex.problem || ''}
        </div>
        <div class="example-solution">
          <strong>解答：</strong>${ex.solution || ''}
        </div>
        <div class="example-answer">
          <strong>答案：</strong>${ex.answer || ''}
        </div>
      </div>
    `).join('');
  },

  /**
   * 格式化练习题
   * @param {array} practice - 练习题列表
   * @returns {string}
   */
  formatPractice(practice) {
    if (!practice || practice.length === 0) return '<p>暂无练习题</p>';
    
    return practice.map((q, i) => `
      <div class="practice-box">
        <div class="practice-header">
          <span class="badge">练习 ${i + 1}</span>
        </div>
        <div class="practice-question">${q.question || ''}</div>
        <div class="practice-hint">
          <span class="callout-icon">提示：</span>${q.hint || ''}
        </div>
        <div class="practice-answer">
          <span class="callout-icon">答案：</span>${q.answer || ''}
        </div>
      </div>
    `).join('');
  },

  /**
   * 格式化常见误解
   * @param {array} misconceptions - 误解列表
   * @returns {string}
   */
  formatMisconceptions(misconceptions) {
    if (!misconceptions || misconceptions.length === 0) return '<p>暂无</p>';
    
    return misconceptions.map(m => `
      <div class="callout">
        <div><span class="callout-icon">常见误解：</span>${m.misconception || ''}</div>
        <div><span class="callout-icon">正确理解：</span>${m.correction || ''}</div>
        <div><span class="callout-icon">解释：</span>${m.explanation || ''}</div>
      </div>
    `).join('');
  },

  /**
   * 格式化学习目标
   * @param {array} objectives - 目标列表
   * @returns {string}
   */
  formatObjectives(objectives) {
    if (!objectives || objectives.length === 0) return '<ul class="objective-list"><li>暂无</li></ul>';
    
    return `<ul class="objective-list">${objectives.map(obj => `<li>${obj}</li>`).join('')}</ul>`;
  }
};

// 导出
window.TemplateEngine = TemplateEngine;