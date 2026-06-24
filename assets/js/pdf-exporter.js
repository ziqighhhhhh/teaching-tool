/**
 * PDF 导出模块
 * 通过浏览器打印功能导出 PDF
 */

const PDFExporter = {
  /**
   * 导出 PDF
   * 触发浏览器打印对话框
   */
  export() {
    // 准备打印
    this.preparePrint();
    
    // 触发打印
    window.print();
    
    // 恢复打印后状态
    setTimeout(() => {
      this.cleanupPrint();
    }, 100);
  },

  /**
   * 准备打印
   * 添加打印优化样式
   */
  preparePrint() {
    // 添加打印类到 body
    document.body.classList.add('printing');
    
    // 保存滚动位置
    this.savedScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // 滚动到顶部，确保从第一页开始打印
    window.scrollTo(0, 0);
  },

  /**
   * 清理打印状态
   */
  cleanupPrint() {
    document.body.classList.remove('printing');
    
    // 恢复滚动位置
    if (this.savedScrollTop !== undefined) {
      window.scrollTo(0, this.savedScrollTop);
    }
  }
};

// 导出
window.PDFExporter = PDFExporter;