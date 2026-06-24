/**
 * 教科书数据适配器
 * 加载和查询预处理后的教科书数据
 */

const TextbookAdapter = {
  // 数据状态
  data: {
    index: null,        // 索引数据
    textbooks: {}       // 缓存的教科书数据
  },

  // 数据路径
  dataPath: 'data/textbooks/',

  /**
   * 加载索引
   * @returns {Promise<boolean>}
   */
  async loadIndex() {
    try {
      const response = await fetch(`${this.dataPath}index.json`);
      if (!response.ok) throw new Error('Index not found');
      this.data.index = await response.json();
      return true;
    } catch (error) {
      console.warn('Failed to load textbook index:', error);
      this.data.index = { subjects: [], grades: [], textbooks: [] };
      return false;
    }
  },

  /**
   * 获取学科列表
   * @returns {string[]}
   */
  getSubjects() {
    return this.data.index?.subjects || [];
  },

  /**
   * 获取年级列表
   * @returns {string[]}
   */
  getGrades() {
    return this.data.index?.grades || [];
  },

  /**
   * 根据学科和年级获取教科书列表
   * @param {string} subject - 学科
   * @param {string} grade - 年级
   * @returns {array}
   */
  getTextbooks(subject = '', grade = '') {
    if (!this.data.index) return [];
    
    return this.data.index.textbooks.filter(tb => {
      if (subject && tb.subject !== subject) return false;
      if (grade && tb.grade !== grade) return false;
      return true;
    });
  },

  /**
   * 加载特定教科书数据
   * @param {string} textbookId - 教科书ID
   * @returns {Promise<object|null>}
   */
  async loadTextbook(textbookId) {
    if (this.data.textbooks[textbookId]) {
      return this.data.textbooks[textbookId];
    }

    try {
      const tb = this.data.index.textbooks.find(t => t.id === textbookId);
      if (!tb) return null;

      const response = await fetch(tb.path);
      if (!response.ok) throw new Error('Textbook data not found');
      
      const data = await response.json();
      this.data.textbooks[textbookId] = data;
      return data;
    } catch (error) {
      console.warn('Failed to load textbook:', error);
      return null;
    }
  },

  /**
   * 获取章节列表
   * @param {string} textbookId - 教科书ID
   * @returns {Promise<array>}
   */
  async getChapters(textbookId) {
    const textbook = await this.loadTextbook(textbookId);
    return textbook?.chapters || [];
  },

  /**
   * 获取小节列表
   * @param {string} textbookId - 教科书ID
   * @param {string} chapterIndex - 章节索引
   * @returns {Promise<array>}
   */
  async getSections(textbookId, chapterIndex) {
    const textbook = await this.loadTextbook(textbookId);
    const chapter = textbook?.chapters?.[chapterIndex];
    return chapter?.sections || [];
  },

  /**
   * 获取小节内容
   * @param {string} textbookId - 教科书ID
   * @param {string} chapterIndex - 章节索引
   * @param {string} sectionIndex - 小节索引
   * @returns {Promise<object|null>}
   */
  async getSectionContent(textbookId, chapterIndex, sectionIndex) {
    const textbook = await this.loadTextbook(textbookId);
    const chapter = textbook?.chapters?.[chapterIndex];
    const section = chapter?.sections?.[sectionIndex];
    return section || null;
  },

  /**
   * 生成知识点描述
   * @param {string} textbookId - 教科书ID
   * @param {string} chapterIndex - 章节索引
   * @param {string} sectionIndex - 小节索引
   * @returns {Promise<string>}
   */
  async generateTopicDescription(textbookId, chapterIndex, sectionIndex) {
    const section = await this.getSectionContent(textbookId, chapterIndex, sectionIndex);
    if (!section) return '';

    const textbook = this.data.textbooks[textbookId];
    const chapter = textbook?.chapters?.[chapterIndex];

    let description = `请生成关于"${section.title}"的讲义。\n\n`;
    
    if (section.content) {
      description += `教材内容：\n${section.content.substring(0, 500)}\n\n`;
    }
    
    if (section.keyPoints && section.keyPoints.length > 0) {
      description += `重点：${section.keyPoints.join('、')}\n`;
    }
    
    if (section.examples && section.examples.length > 0) {
      description += `包含例题：${section.examples.length}道\n`;
    }

    description += `\n学科：${textbook?.subject || ''}\n`;
    description += `年级：${textbook?.grade || ''}\n`;
    description += `章节：${chapter?.title || ''}\n`;

    return description;
  },

  /**
   * 填充选择器
   * @param {HTMLElement} select - 选择器元素
   * @param {array} items - 选项列表
   * @param {string} label - 默认选项文本
   */
  populateSelect(select, items, label = '请选择') {
    select.innerHTML = `<option value="">${label}</option>`;
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = typeof item === 'object' ? item.id || item.value : item;
      option.textContent = typeof item === 'object' ? item.name || item.label : item;
      select.appendChild(option);
    });
  }
};

// 导出
window.TextbookAdapter = TextbookAdapter;
