/**
 * 简易编辑器模块
 * 提供富文本编辑功能
 */

const Editor = {
  // 编辑器容器
  container: null,
  
  // 工具栏
  toolbar: null,

  /**
   * 初始化编辑器
   * @param {string} containerId - 容器ID
   * @param {string} toolbarId - 工具栏ID
   */
  init(containerId, toolbarId) {
    this.container = document.getElementById(containerId);
    this.toolbar = document.getElementById(toolbarId);
    
    if (!this.container || !this.toolbar) {
      console.error('Editor initialization failed: container or toolbar not found');
      return;
    }

    this.bindToolbarEvents();
  },

  /**
   * 绑定工具栏事件
   */
  bindToolbarEvents() {
    // 格式按钮
    const formatButtons = this.toolbar.querySelectorAll('[data-action]');
    formatButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        this.execFormat(action);
      });
    });

    // 字体大小
    const fontSizeSelect = this.toolbar.querySelector('#font-size-select');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        this.execFormat('fontSize', e.target.value + 'px');
      });
    }
  },

  /**
   * 执行格式命令
   * @param {string} command - 命令
   * @param {string} value - 值
   */
  execFormat(command, value = null) {
    document.execCommand(command, false, value);
    this.container.focus();
  },

  /**
   * 设置内容
   * @param {string} html - HTML内容
   */
  setContent(html) {
    if (this.container) {
      this.container.innerHTML = html;
    }
  },

  /**
   * 获取内容
   * @returns {string}
   */
  getContent() {
    return this.container ? this.container.innerHTML : '';
  },

  /**
   * 获取纯文本
   * @returns {string}
   */
  getText() {
    return this.container ? this.container.innerText : '';
  },

  /**
   * 清空内容
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
};

// 导出
window.Editor = Editor;
