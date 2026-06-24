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
    inputMode: 'text',
    isGenerating: false,
    lastGeneratedData: null
  },

  /**
   * 初始化应用
   */
  async init() {
    // 绑定 DOM 元素
    this.bindElements();
    
    // 绑定事件
    this.bindEvents();
    
    // 加载教科书索引
    await TextbookAdapter.loadIndex();
    this.populateTextbookSelectors();
    
    // 加载缓存统计
    this.updateCacheInfo();
    
    // 检查 API 配置
    if (!SkillCaller.isConfigured()) {
      this.showConfigNotice();
    }
    
    console.log('App initialized');
  },

  /**
   * 绑定 DOM 元素
   */
  bindElements() {
    this.elements = {
      // 输入控制
      inputMode: document.getElementById('input-mode'),
      textInputGroup: document.getElementById('text-input-group'),
      textbookInputGroup: document.getElementById('textbook-input-group'),
      uploadInputGroup: document.getElementById('upload-input-group'),
      topicInput: document.getElementById('topic-input'),
      fileUpload: document.getElementById('file-upload'),
      
      // 教科书选择器
      subjectSelect: document.getElementById('subject-select'),
      gradeSelect: document.getElementById('grade-select'),
      textbookSelect: document.getElementById('textbook-select'),
      chapterSelect: document.getElementById('chapter-select'),
      sectionSelect: document.getElementById('section-select'),
      
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
      statusBar: document.getElementById('status-bar'),
      cacheInfo: document.getElementById('cache-info')
    };
  },

  /**
   * 绑定事件
   */
  bindEvents() {
    const { elements } = this;
    
    // 输入模式切换
    elements.inputMode.addEventListener('change', (e) => {
      this.switchInputMode(e.target.value);
    });
    
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
    
    // 文件上传
    elements.fileUpload.addEventListener('change', (e) => {
      this.handleFileUpload(e.target.files[0]);
    });
    
    // 教科书选择器级联
    elements.subjectSelect.addEventListener('change', () => this.updateTextbookOptions());
    elements.gradeSelect.addEventListener('change', () => this.updateTextbookOptions());
    elements.textbookSelect.addEventListener('change', () => this.updateChapterOptions());
    elements.chapterSelect.addEventListener('change', () => this.updateSectionOptions());
  },

  /**
   * 切换输入模式
   * @param {string} mode - 模式
   */
  switchInputMode(mode) {
    this.state.inputMode = mode;
    
    const groups = {
      text: this.elements.textInputGroup,
      textbook: this.elements.textbookInputGroup,
      upload: this.elements.uploadInputGroup
    };
    
    Object.keys(groups).forEach(key => {
      if (key === mode) {
        groups[key].classList.remove('hidden');
      } else {
        groups[key].classList.add('hidden');
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
  async generateHandout(forceRefresh = false) {
    if (this.state.isGenerating) return;
    
    // 获取输入内容
    const topic = await this.getInputContent();
    if (!topic) {
      alert('请输入知识点或选择章节');
      return;
    }
    
    // 检查 API 配置
    if (!SkillCaller.isConfigured()) {
      const endpoint = prompt('请输入 API 端点（如：https://api.openai.com/v1/chat/completions）：');
      const key = prompt('请输入 API 密钥：');
      if (endpoint && key) {
        SkillCaller.updateConfig({ apiEndpoint: endpoint, apiKey: key });
      } else {
        alert('需要配置 API 才能生成讲义');
        return;
      }
    }
    
    this.setGenerating(true);
    
    try {
      // 检查缓存
      const config = {
        template: this.state.currentTemplate,
        theme: this.state.currentTheme,
        difficulty: this.state.currentDifficulty
      };
      
      const cacheKey = await CacheManager.generateKey(topic, config);
      
      if (!forceRefresh) {
        const cached = CacheManager.get(cacheKey);
        if (cached) {
          console.log('Cache hit');
          this.state.lastGeneratedData = cached.structuredData;
          this.renderHandout(cached.structuredData);
          this.setGenerating(false);
          this.updateCacheInfo();
          return;
        }
      }
      
      // 调用 API 生成
      console.log('Generating handout...');
      const data = await SkillCaller.generateHandout(topic, {
        subject: this.elements.subjectSelect.value,
        grade: this.elements.gradeSelect.value,
        difficulty: this.state.currentDifficulty
      });
      
      // 保存到缓存
      const html = await this.renderHandout(data);
      CacheManager.set(cacheKey, {
        html,
        structuredData: data,
        skillVersion: '1.0'
      });
      
      this.state.lastGeneratedData = data;
      this.updateCacheInfo();
      
    } catch (error) {
      console.error('Generation failed:', error);
      alert('生成失败：' + error.message);
    } finally {
      this.setGenerating(false);
    }
  },

  /**
   * 获取输入内容
   * @returns {Promise<string>}
   */
  async getInputContent() {
    const { inputMode } = this.state;
    
    if (inputMode === 'text') {
      return this.elements.topicInput.value.trim();
    } else if (inputMode === 'textbook') {
      const textbookId = this.elements.textbookSelect.value;
      const chapterIndex = this.elements.chapterSelect.value;
      const sectionIndex = this.elements.sectionSelect.value;
      
      if (textbookId && chapterIndex !== '' && sectionIndex !== '') {
        return await TextbookAdapter.generateTopicDescription(
          textbookId, chapterIndex, sectionIndex
        );
      }
    } else if (inputMode === 'upload') {
      // TODO: 处理文件上传
      return this.elements.topicInput.value.trim();
    }
    
    return '';
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
   * 处理文件上传
   * @param {File} file - 文件
   */
  async handleFileUpload(file) {
    if (!file) return;
    
    // 读取文件内容
    const reader = new FileReader();
    reader.onload = (e) => {
      this.elements.topicInput.value = e.target.result;
    };
    
    if (file.type === 'text/plain' || file.name.endsWith('.md')) {
      reader.readAsText(file);
    } else {
      // 对于 PDF/Word，需要服务器端处理
      alert('PDF/Word 文件解析需要后端支持，当前版本仅支持文本文件');
    }
  },

  /**
   * 更新缓存信息
   */
  updateCacheInfo() {
    const stats = CacheManager.getStats();
    this.elements.cacheInfo.textContent = `缓存: ${stats.count} 条 (${stats.totalSize})`;
  },

  /**
   * 显示配置提示
   */
  showConfigNotice() {
    console.log('API not configured. Please set up in settings.');
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// 导出
window.App = App;