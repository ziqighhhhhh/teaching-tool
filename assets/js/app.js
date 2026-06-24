/**
 * 主应用逻辑
 * 整合所有模块，处理用户交互
 */

const App = {
  // 状态
  state: {
    currentTemplate: 'classic',
    currentTheme: 'blue',
    currentDifficulty: 'basic',
    isGenerating: false,
    lastGeneratedData: null,
    demoMode: false,  // 演示模式（无 API 时使用 mock 数据）
    debugMode: true   // 开发阶段：true=只显示纯文本内容，false=直接渲染
  },

  /**
   * 初始化应用
   */
  async init() {
    // 绑定 DOM 元素
    this.bindElements();
    
    // 绑定事件
    this.bindEvents();
    
    // 初始化编辑器
    Editor.init('handout-content', 'editor-toolbar', 'preview-container');
    
    console.log('App initialized');
  },

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 输入控制
      topicInput: document.getElementById('topic-input'),
      gradeManual: document.getElementById('grade-manual'),
      
      // 配置选项
      templateSelect: document.getElementById('template-select'),
      themeSelect: document.getElementById('theme-select'),
      difficultySelect: document.getElementById('difficulty-select'),
      
      // 按钮
      generateBtn: document.getElementById('generate-btn'),
      refreshBtn: document.getElementById('refresh-btn'),
      exportBtn: document.getElementById('export-btn'),
      
      // 编辑预览
      handoutContent: document.getElementById('handout-content'),
      loadingOverlay: document.getElementById('loading-overlay'),
      statusBar: document.getElementById('status-bar')
    };
    
    // 开发阶段：创建"渲染页面"按钮
    if (this.state.debugMode) {
      this.createRenderButton();
    }
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    const { elements } = this;
    
    // 生成按钮
    elements.generateBtn.addEventListener('click', () => {
      this.generateHandout();
    });
    
    // 重新生成按钮
    elements.refreshBtn.addEventListener('click', () => {
      this.generateHandout(true);
    });
    
    // 导出按钮
    elements.exportBtn.addEventListener('click', () => {
      PDFExporter.export();
    });
    
    // 模板切换
    elements.templateSelect.addEventListener('change', (e) => {
      this.state.currentTemplate = e.target.value;
      if (this.state.lastGeneratedData) {
        this.renderHandout(this.state.lastGeneratedData);
      }
    });
    
    // 主题切换
    elements.themeSelect.addEventListener('change', (e) => {
      this.state.currentTheme = e.target.value;
      if (this.state.lastGeneratedData) {
        this.renderHandout(this.state.lastGeneratedData);
      }
    });
    
    // 难度切换
    elements.difficultySelect.addEventListener('change', (e) => {
      this.state.currentDifficulty = e.target.value;
    });
  },

  /**
   * 创建"渲染页面"按钮（开发阶段使用）
   */
  createRenderButton() {
    const renderBtn = document.createElement('button');
    renderBtn.id = 'render-btn';
    renderBtn.className = 'render-btn hidden';
    renderBtn.textContent = '渲染页面';
    renderBtn.style.cssText = 'background: #4CAF50; color: white; margin-top: 10px; width: 100%; padding: 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px;';
    
    // 插入到"重新生成"按钮后面
    const refreshBtn = document.getElementById('refresh-btn');
    refreshBtn.parentNode.insertBefore(renderBtn, refreshBtn.nextSibling);
    
    this.elements.renderBtn = renderBtn;
    
    // 绑定事件
    renderBtn.addEventListener('click', () => {
      if (this.state.lastGeneratedData) {
        this.renderHandout(this.state.lastGeneratedData);
        renderBtn.classList.add('hidden');
      }
    });
  },

  /**
   * 填充教科书选择器
   */
  populateTextbookSelectors() {
    const subjects = TextbookAdapter.getSubjects();
    const grades = TextbookAdapter.getGrades();
    
    TextbookAdapter.populateSelect(this.elements.subjectSelect, subjects, '学科');
    TextbookAdapter.populateSelect(this.elements.gradeSelect, grades, '年级');
  },

  /**
   * 更新教科书选项
   */
  updateTextbookOptions() {
    const subject = this.elements.subjectSelect.value;
    const grade = this.elements.gradeSelect.value;
    const textbooks = TextbookAdapter.getTextbooks(subject, grade);
    
    TextbookAdapter.populateSelect(
      this.elements.textbookSelect,
      textbooks.map(tb => ({ id: tb.id, name: tb.name })),
      '教科书'
    );
    
    // 清空下级选择器
    this.elements.chapterSelect.innerHTML = '<option value="">章节</option>';
    this.elements.sectionSelect.innerHTML = '<option value="">小节</option>';
  },

  /**
   * 更新章节选项
   */
  async updateChapterOptions() {
    const textbookId = this.elements.textbookSelect.value;
    if (!textbookId) return;
    
    const chapters = await TextbookAdapter.getChapters(textbookId);
    TextbookAdapter.populateSelect(
      this.elements.chapterSelect,
      chapters.map((ch, i) => ({ id: i, name: ch.title })),
      '章节'
    );
    
    // 清空小节选择器
    this.elements.sectionSelect.innerHTML = '<option value="">小节</option>';
  },

  /**
   * 更新小节选项
   */
  async updateSectionOptions() {
    const textbookId = this.elements.textbookSelect.value;
    const chapterIndex = this.elements.chapterSelect.value;
    if (!textbookId || chapterIndex === '') return;
    
    const sections = await TextbookAdapter.getSections(textbookId, chapterIndex);
    TextbookAdapter.populateSelect(
      this.elements.sectionSelect,
      sections.map((sec, i) => ({ id: i, name: sec.title })),
      '小节'
    );
  },

  /**
   * 生成讲义
   * @param {boolean} forceRefresh - 强制刷新（跳过缓存）
   */
  /**
   * 生成讲义
   * @param {boolean} forceRefresh - 强制刷新（跳过缓存）
   */
  async generateHandout(forceRefresh = false) {
    if (this.state.isGenerating) return;
    
    // 获取输入内容
    const inputData = await this.getInputContent();
    if (!inputData) {
      alert('请输入知识点或选择章节');
      return;
    }
    
    this.setGenerating(true);
    
    try {
      // 检查缓存
      const config = {
        template: this.state.currentTemplate,
        theme: this.state.currentTheme,
        difficulty: this.state.currentDifficulty
      };
      
      const cacheKey = await CacheManager.generateKey(inputData.topic + inputData.grade, config);
      
      if (!forceRefresh) {
        const cached = CacheManager.get(cacheKey);
        if (cached) {
          console.log('Cache hit');
          this.state.lastGeneratedData = cached.structuredData;
          if (this.state.debugMode) {
            this.showRawContent(cached.structuredData);
          } else {
            this.renderHandout(cached.structuredData);
          }
          this.setGenerating(false);
          this.updateCacheInfo();
          return;
        }
      }
      
      // 调用本地 API 生成
      console.log('Generating handout...');
      const data = await this.callLocalAPI(inputData.topic, {
        grade: inputData.grade,
        difficulty: this.state.currentDifficulty
      });
      
      // 保存到缓存
      if (this.state.debugMode) {
        // 开发阶段：显示纯文本
        this.showRawContent(data);
      } else {
        // 正常流程：直接渲染
        const html = await this.renderHandout(data);
      }
      
      CacheManager.set(cacheKey, {
        html: '',
        structuredData: data,
        skillVersion: '1.0'
      });
      
      this.state.lastGeneratedData = data;
      this.updateCacheInfo();
      
    } catch (error) {
      console.error('Generation failed:', error);
      // 如果 API 失败，使用演示模式
      console.log('API failed, falling back to demo mode...');
      try {
        const fallbackConfig = {
          template: this.state.currentTemplate,
          theme: this.state.currentTheme,
          difficulty: this.state.currentDifficulty
        };
        const data = this.generateMockData(inputData.topic, '数学', inputData.grade);
        
        if (this.state.debugMode) {
          // 开发阶段：显示纯文本
          this.showRawContent(data);
        } else {
          // 正常流程：直接渲染
          const html = await this.renderHandout(data);
        }
        
        CacheManager.set(await CacheManager.generateKey(inputData.topic + inputData.grade, fallbackConfig), {
          html: '',
          structuredData: data,
          skillVersion: '1.0'
        });
        this.state.lastGeneratedData = data;
        this.updateCacheInfo();
      } catch (demoError) {
        alert('生成失败：' + error.message);
      }
    } finally {
      this.setGenerating(false);
    }
  },

  /**
   * 调用本地 API
   * @param {string} topic - 知识点
   * @param {object} options - 选项
   * @returns {Promise<object>}
   */
  async callLocalAPI(topic, options = {}) {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topic: topic,
        grade: options.grade || '',
        difficulty: options.difficulty || 'basic'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * 生成演示数据（mock）
   * @param {string} topic - 知识点
   * @param {string} subject - 学科
   * @param {string} grade - 年级
   * @returns {object} - 演示数据
   */
  generateMockData(topic, subject = '数学', grade = '七年级') {
    const data = {
      topic: topic,
      subject: subject,
      grade: grade,
      difficulty: this.state.currentDifficulty,
      knowledge_overview: '<ul><li><strong>核心概念：</strong>{{topic}}是{{subject}}学科的重要知识点</li><li><strong>基本要求：</strong>理解{{topic}}的定义和基本性质</li><li><strong>应用目标：</strong>能够运用{{topic}}解决简单问题</li></ul>',
      key_explanation: '<p><strong>一、定义与概念</strong></p><p>{{topic}}是指在特定条件下形成的一种数学关系。理解这个定义的关键在于把握其构成要素和适用条件。</p><p><strong>二、核心性质</strong></p><p>1. 基本性质：满足特定条件时成立</p><p>2. 推导关系：可以通过已知条件推导得出</p><p>3. 应用范围：适用于特定类型的题目</p><p><strong>三、学习要点</strong></p><p>学习{{topic}}时，建议先理解概念本质，再通过例题掌握应用方法，最后通过练习巩固。</p>',
      classic_examples: [
        {
          title: '基础例题',
          problem: '已知条件，求{{topic}}的相关值。',
          analysis: '首先分析题目给出的条件，找出与{{topic}}相关的信息。',
          solution: '第一步：理解题意，提取已知条件；第二步：运用{{topic}}的相关性质；第三步：逐步推导计算。',
          answer: '最终结果：根据具体计算得出',
          method_summary: '通过本题掌握{{topic}}的基本应用方法'
        }
      ],
      variation_training: [
        { question: '变式1：改变条件，求{{topic}}的另一种情况', hint: '注意条件变化对结果的影响' },
        { question: '变式2：结合实际情境，应用{{topic}}', hint: '将抽象概念与实际联系起来' },
        { question: '变式3：综合多个知识点，运用{{topic}}', hint: '注意与其他知识点的结合' }
      ],
      common_mistakes: [
        {
          wrong: '忽略{{topic}}的适用条件，直接套用公式',
          correct: '先判断条件是否满足，再选择合适的方法',
          reason: '每个概念都有其适用范围，必须注意前提条件'
        }
      ],
      practice: {
        basic: [
          { question: '基础练习1：判断{{topic}}的基本概念', answer: '解析：根据定义判断...' },
          { question: '基础练习2：简单应用{{topic}}解决问题', answer: '解析：直接套用公式...' },
          { question: '基础练习3：{{topic}}的基本计算', answer: '解析：按步骤计算...' }
        ],
        advanced: [
          { question: '提高练习1：{{topic}}的灵活应用', answer: '解析：需要转换思路...' },
          { question: '提高练习2：结合其他知识运用{{topic}}', answer: '解析：综合运用多个知识点...' }
        ],
        extension: [
          { question: '拓展练习：{{topic}}的深入探究', answer: '解析：需要更深入理解...' }
        ]
      },
      summary: '<p><strong>知识网络：</strong>{{topic}}与前后知识的联系</p><p><strong>核心要点：</strong>掌握定义、性质、应用方法</p><p><strong>学习方法：</strong>理解概念→掌握例题→变式训练→总结反思</p>'
    };
    
    // 递归替换占位符
    const replacePlaceholders = (obj) => {
      if (typeof obj === 'string') {
        return obj
          .replace(/{{topic}}/g, topic)
          .replace(/{{subject}}/g, subject)
          .replace(/{{grade}}/g, grade);
      }
      if (Array.isArray(obj)) {
        return obj.map(replacePlaceholders);
      }
      if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = replacePlaceholders(value);
        }
        return result;
      }
      return obj;
    };
    
    return replacePlaceholders(data);
  },

  /**
   * 获取输入内容
   * @returns {Promise<object>}
   */
  async getInputContent() {
    const topic = this.elements.topicInput.value.trim();
    if (!topic) return null;
    
    return {
      topic: topic,
      grade: this.elements.gradeManual?.value || '七年级'
    };
  },

  /**
   * 渲染讲义
   * @param {object} data - 讲义数据
   * @returns {Promise<string>}
   */
  async renderHandout(data) {
    const html = await TemplateEngine.render(
      this.state.currentTemplate,
      data,
      this.state.currentTheme
    );
    
    Editor.setContent(html);
    return html;
  },

  /**
   * 显示纯文本内容（开发阶段调试用）
   * @param {object} data - 讲义数据
   */
  showRawContent(data) {
    const { topic, subject, grade, difficulty } = data;
    
    let text = `=== ${topic} ===\n`;
    text += `学科: ${subject} | 年级: ${grade} | 难度: ${difficulty}\n\n`;
    
    // 模块1: 知识速览
    text += `【知识速览】\n`;
    text += this.stripHtml(data.knowledge_overview) + '\n\n';
    
    // 模块2: 重点精讲
    text += `【重点精讲】\n`;
    text += this.stripHtml(data.key_explanation) + '\n\n';
    
    // 模块3: 典例分析
    text += `【典例分析】\n`;
    if (data.classic_examples && data.classic_examples.length > 0) {
      data.classic_examples.forEach((ex, i) => {
        text += `例题 ${i + 1}: ${ex.title || '无标题'}\n`;
        text += `  题目: ${ex.problem || '无'}\n`;
        text += `  分析: ${ex.analysis || '无'}\n`;
        text += `  解答: ${ex.solution || '无'}\n`;
        text += `  答案: ${ex.answer || '无'}\n`;
        text += `  方法总结: ${ex.method_summary || '无'}\n\n`;
      });
    } else {
      text += '(无例题)\n\n';
    }
    
    // 模块4: 变式训练
    text += `【变式训练】\n`;
    if (data.variation_training && data.variation_training.length > 0) {
      data.variation_training.forEach((q, i) => {
        text += `变式 ${i + 1}: ${q.question || '无'}\n`;
        text += `  提示: ${q.hint || '无'}\n\n`;
      });
    } else {
      text += '(无变式训练)\n\n';
    }
    
    // 模块5: 易错警示
    text += `【易错警示】\n`;
    if (data.common_mistakes && data.common_mistakes.length > 0) {
      data.common_mistakes.forEach((m, i) => {
        text += `错误 ${i + 1}:\n`;
        text += `  常见错误: ${m.wrong || '无'}\n`;
        text += `  正确做法: ${m.correct || '无'}\n`;
        text += `  原因分析: ${m.reason || '无'}\n\n`;
      });
    } else {
      text += '(无易错警示)\n\n';
    }
    
    // 模块6: 巩固练习
    text += `【巩固练习】\n`;
    if (data.practice) {
      if (data.practice.basic && data.practice.basic.length > 0) {
        text += '基础巩固:\n';
        data.practice.basic.forEach((q, i) => {
          text += `  ${i + 1}. ${q.question || '无'}\n`;
          text += `     答案: ${q.answer || '无'}\n`;
        });
        text += '\n';
      }
      if (data.practice.advanced && data.practice.advanced.length > 0) {
        text += '能力提升:\n';
        data.practice.advanced.forEach((q, i) => {
          text += `  ${i + 1}. ${q.question || '无'}\n`;
          text += `     答案: ${q.answer || '无'}\n`;
        });
        text += '\n';
      }
      if (data.practice.extension && data.practice.extension.length > 0) {
        text += '拓展探究:\n';
        data.practice.extension.forEach((q, i) => {
          text += `  ${i + 1}. ${q.question || '无'}\n`;
          text += `     答案: ${q.answer || '无'}\n`;
        });
        text += '\n';
      }
    } else {
      text += '(无练习)\n\n';
    }
    
    // 模块7: 归纳总结
    text += `【归纳总结】\n`;
    text += this.stripHtml(data.summary) + '\n';
    
    // 显示纯文本到编辑器
    this.elements.handoutContent.innerHTML = `<pre style="white-space: pre-wrap; font-family: monospace; font-size: 14px; line-height: 1.6; padding: 20px; background: #f9f9f9; color: #333;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
    
    // 显示渲染按钮
    if (this.elements.renderBtn) {
      this.elements.renderBtn.classList.remove('hidden');
    }
  },

  /**
   * 去除 HTML 标签
   * @param {string} html - HTML 字符串
   * @returns {string} - 纯文本
   */
  stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  },

  /**
   * 设置生成状态
   * @param {boolean} generating - 是否正在生成
   */
  setGenerating(generating) {
    this.state.isGenerating = generating;
    
    if (generating) {
      this.elements.loadingOverlay.classList.remove('hidden');
      this.elements.generateBtn.disabled = true;
      this.elements.generateBtn.textContent = '生成中...';
    } else {
      this.elements.loadingOverlay.classList.add('hidden');
      this.elements.generateBtn.disabled = false;
      this.elements.generateBtn.textContent = '生成讲义';
      this.elements.refreshBtn.classList.remove('hidden');
    }
  },

  /**
   * 显示配置提示
   */
  showConfigNotice() {
    console.log('API not configured. Running in demo mode with mock data.');
  },

  /**
   * 更新缓存信息（已隐藏，保留方法避免报错）
   */
  updateCacheInfo() {
    // 缓存管理已隐藏，此方法保留以避免报错
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 导出
window.App = App;
