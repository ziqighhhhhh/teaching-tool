/**
 * 缓存管理模块
 * 使用 SHA-256 哈希 + LocalStorage 实现内容缓存
 * 减少重复 API 调用，降低 Token 消耗
 */

const CacheManager = {
  // 缓存配置
  config: {
    prefix: 'teaching_cache_',
    maxItems: 50,        // 最大缓存条目数
    ttl: 7 * 24 * 60 * 60 * 1000, // 7 天有效期
    version: '1.0'
  },

  /**
   * 计算 SHA-256 哈希
   * @param {string} input - 输入字符串
   * @returns {Promise<string>} - 哈希值（hex 字符串）
   */
  async hash(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * 生成缓存键
   * @param {string} input - 输入内容
   * @param {object} config - 配置参数
   * @returns {Promise<string>} - 完整缓存键
   */
  async generateKey(input, config = {}) {
    const configStr = JSON.stringify(config);
    const hash = await this.hash(input + configStr);
    return this.config.prefix + hash;
  },

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {object|null} - 缓存数据或 null
   */
  get(key) {
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;

      const parsed = JSON.parse(data);
      
      // 检查版本
      if (parsed.version !== this.config.version) {
        localStorage.removeItem(key);
        return null;
      }
      
      // 检查有效期
      if (Date.now() - parsed.timestamp > this.config.ttl) {
        localStorage.removeItem(key);
        return null;
      }
      
      return parsed;
    } catch (e) {
      console.warn('Cache read error:', e);
      return null;
    }
  },

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {object} data - 缓存数据
   */
  set(key, data) {
    try {
      // 清理旧缓存
      this.cleanup();
      
      const cacheItem = {
        html: data.html,
        structuredData: data.structuredData,
        timestamp: Date.now(),
        version: this.config.version,
        skillVersion: data.skillVersion || 'unknown'
      };
      
      localStorage.setItem(key, JSON.stringify(cacheItem));
    } catch (e) {
      console.warn('Cache write error:', e);
      // 如果存储失败（容量不足），清理后再试
      if (e.name === 'QuotaExceededError') {
        this.clearOldest(10);
        try {
          localStorage.setItem(key, JSON.stringify(cacheItem));
        } catch (e2) {
          console.error('Cache write failed after cleanup:', e2);
        }
      }
    }
  },

  /**
   * 检查缓存是否存在且有效
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  },

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  remove(key) {
    localStorage.removeItem(key);
  },

  /**
   * 清理过期缓存
   */
  cleanup() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.config.prefix)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (Date.now() - data.timestamp > this.config.ttl) {
            localStorage.removeItem(key);
          } else {
            keys.push({ key, timestamp: data.timestamp });
          }
        } catch (e) {
          localStorage.removeItem(key);
        }
      }
    }
    
    // 如果缓存数量超过限制，删除最旧的
    if (keys.length > this.config.maxItems) {
      keys.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = keys.slice(0, keys.length - this.config.maxItems);
      toRemove.forEach(item => localStorage.removeItem(item.key));
    }
  },

  /**
   * 清理最旧的 n 条缓存
   * @param {number} n - 数量
   */
  clearOldest(n) {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.config.prefix)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          keys.push({ key, timestamp: data.timestamp });
        } catch (e) {
          keys.push({ key, timestamp: 0 });
        }
      }
    }
    
    keys.sort((a, b) => a.timestamp - b.timestamp);
    keys.slice(0, n).forEach(item => localStorage.removeItem(item.key));
  },

  /**
   * 清空所有缓存
   */
  clearAll() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.config.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  },

  /**
   * 获取缓存统计信息
   * @returns {object}
   */
  getStats() {
    let count = 0;
    let totalSize = 0;
    let oldest = Date.now();
    let newest = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.config.prefix)) {
        const data = localStorage.getItem(key);
        totalSize += data.length;
        count++;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.timestamp < oldest) oldest = parsed.timestamp;
          if (parsed.timestamp > newest) newest = parsed.timestamp;
        } catch (e) {}
      }
    }

    return {
      count,
      totalSize: (totalSize / 1024).toFixed(2) + ' KB',
      oldest: oldest < Date.now() ? new Date(oldest).toLocaleString() : 'N/A',
      newest: newest > 0 ? new Date(newest).toLocaleString() : 'N/A'
    };
  }
};

// 导出
window.CacheManager = CacheManager;
