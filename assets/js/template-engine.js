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
      
      // 7 模块结构
      knowledge_overview: data.knowledge_overview || '<p>暂无知识速览内容</p>',
      key_explanation: data.key_explanation || '<p>暂无重点精讲内容</p>',
      classic_examples: this.formatClassicExamples(data.classic_examples || []),
      variation_training: this.formatVariationTraining(data.variation_training || []),
      common_mistakes: this.formatCommonMistakes(data.common_mistakes || []),
      practice: this.formatPractice(data.practice || { basic: [], advanced: [], extension: [] }),
      summary: data.summary || '<p>暂无总结内容</p>'
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
   * 格式化典例分析
   * @param {array} examples - 例题列表
   * @returns {string}
   */
  formatClassicExamples(examples) {
    if (!examples || examples.length === 0) return '<p>暂无例题</p>';
    
    return examples.map((ex, i) => `
      <div class="example-box">
        <div class="example-header">
          <span class="badge">例题 ${i + 1}</span>
          <span class="example-title">${ex.title || ''}</span>
        </div>
        <div class="example-section">
          <div class="example-label">题目</div>
          <div class="example-problem">${ex.problem || ''}</div>
        </div>
        <div class="example-section">
          <div class="example-label">分析</div>
          <div class="example-analysis">${ex.analysis || ''}</div>
        </div>
        <div class="example-section">
          <div class="example-label">解答</div>
          <div class="example-solution">${ex.solution || ''}</div>
        </div>
        <div class="example-section">
          <div class="example-label">答案</div>
          <div class="example-answer">${ex.answer || ''}</div>
        </div>
        <div class="example-section">
          <div class="example-label">方法总结</div>
          <div class="example-method">${ex.method_summary || ''}</div>
        </div>
      </div>
    `).join('');
  },

  /**
   * 格式化变式训练
   * @param {array} variations - 变式题列表
   * @returns {string}
   */
  formatVariationTraining(variations) {
    if (!variations || variations.length === 0) return '<p>暂无变式训练</p>';
    
    return variations.map((q, i) => `
      <div class="variation-box">
        <div class="variation-header">
          <span class="badge">变式 ${i + 1}</span>
        </div>
        <div class="variation-question">${q.question || ''}</div>
        <div class="variation-hint">
          <span class="hint-icon">提示：</span>${q.hint || ''}
        </div>
      </div>
    `).join('');
  },

  /**
   * 格式化易错警示
   * @param {array} mistakes - 错误列表
   * @returns {string}
   */
  formatCommonMistakes(mistakes) {
    if (!mistakes || mistakes.length === 0) return '<p>暂无易错警示</p>';
    
    return mistakes.map(m => `
      <div class="mistake-box">
        <div class="mistake-section">
          <div class="mistake-label error-label">常见错误</div>
          <div class="mistake-wrong">${m.wrong || ''}</div>
        </div>
        <div class="mistake-section">
          <div class="mistake-label correct-label">正确做法</div>
          <div class="mistake-correct">${m.correct || ''}</div>
        </div>
        <div class="mistake-section">
          <div class="mistake-label reason-label">原因分析</div>
          <div class="mistake-reason">${m.reason || ''}</div>
        </div>
      </div>
    `).join('');
  },

  /**
   * 格式化巩固练习
   * @param {object} practice - 练习数据
   * @returns {string}
   */
  formatPractice(practice) {
    if (!practice) return '<p>暂无练习</p>';
    
    let html = '';
    
    // 基础题
    if (practice.basic && practice.basic.length > 0) {
      html += '<div class="practice-level"><div class="practice-level-title">基础巩固</div>';
      practice.basic.forEach((q, i) => {
        html += `
          <div class="practice-item">
            <div class="practice-question">${i + 1}. ${q.question || ''}</div>
            <div class="practice-answer">答案：${q.answer || ''}</div>
          </div>
        `;
      });
      html += '</div>';
    }
    
    // 提高题
    if (practice.advanced && practice.advanced.length > 0) {
      html += '<div class="practice-level"><div class="practice-level-title">能力提升</div>';
      practice.advanced.forEach((q, i) => {
        html += `
          <div class="practice-item">
            <div class="practice-question">${i + 1}. ${q.question || ''}</div>
            <div class="practice-answer">答案：${q.answer || ''}</div>
          </div>
        `;
      });
      html += '</div>';
    }
    
    // 拓展题
    if (practice.extension && practice.extension.length > 0) {
      html += '<div class="practice-level"><div class="practice-level-title">拓展探究</div>';
      practice.extension.forEach((q, i) => {
        html += `
          <div class="practice-item">
            <div class="practice-question">${i + 1}. ${q.question || ''}</div>
            <div class="practice-answer">答案：${q.answer || ''}</div>
          </div>
        `;
      });
      html += '</div>';
    }
    
    return html || '<p>暂无练习</p>';
  }
};

// 导出
window.TemplateEngine = TemplateEngine;