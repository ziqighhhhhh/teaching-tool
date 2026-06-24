/**
 * 简易编辑器模块
 * 提供富文本编辑功能，支持打印预览模式
 */

const Editor = {
  // 编辑器容器
  container: null,
  
  // 工具栏
  toolbar: null,
  
  // 预览容器
  previewContainer: null,
  
  // 打印预览模式
  printPreviewMode: false,

  /**
   * 初始化编辑器
   * @param {string} containerId - 容器ID
   * @param {string} toolbarId - 工具栏ID
   * @param {string} previewContainerId - 预览容器ID
   */
  init(containerId, toolbarId, previewContainerId) {
    this.container = document.getElementById(containerId);
    this.toolbar = document.getElementById(toolbarId);
    this.previewContainer = document.getElementById(previewContainerId);
    
    if (!this.container || !this.toolbar) {
      console.error('Editor initialization failed: container or toolbar not found');
      return;
    }

    this.bindToolbarEvents();
    this.bindContainerEvents();
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
    
    // 打印预览切换
    const previewToggle = this.toolbar.querySelector('#preview-toggle');
    if (previewToggle) {
      previewToggle.addEventListener('click', () => {
        this.togglePrintPreview();
      });
    }
  },
  
  /**
   * 绑定容器事件
   */
  bindContainerEvents() {
    // 处理粘贴事件，清理格式
    this.container.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    
    // 处理 Tab 键
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      }
    });
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
   * 切换打印预览模式
   */
  togglePrintPreview() {
    this.printPreviewMode = !this.printPreviewMode;
    const previewToggle = this.toolbar.querySelector('#preview-toggle');
    
    if (this.printPreviewMode) {
      // 进入打印预览模式
      this.container.classList.add('print-preview');
      this.previewContainer.classList.add('print-preview-mode');
      document.body.classList.add('previewing');
      if (previewToggle) previewToggle.textContent = '编辑模式';
      
      // 隐藏编辑器边框和提示
      this.container.style.border = 'none';
      this.container.style.boxShadow = 'none';
      this.container.style.cursor = 'default';
      this.container.setAttribute('contenteditable', 'false');
    } else {
      // 退出打印预览模式
      this.container.classList.remove('print-preview');
      this.previewContainer.classList.remove('print-preview-mode');
      document.body.classList.remove('previewing');
      if (previewToggle) previewToggle.textContent = '打印预览';
      
      // 恢复编辑器状态
      this.container.style.border = '';
      this.container.style.boxShadow = '';
      this.container.style.cursor = '';
      this.container.setAttribute('contenteditable', 'true');
    }
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