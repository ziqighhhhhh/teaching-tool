/**
 * Skill 调用封装模块
 * 统一调用接口，支持配置管理和错误处理
 */

const SkillCaller = {
  // 默认配置
  config: {
    apiEndpoint: '',
    apiKey: '',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000
  },

  /**
   * 加载用户配置
   */
  loadConfig() {
    try {
      const saved = localStorage.getItem('teaching_tool_config');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Config load error:', e);
    }
  },

  /**
   * 保存用户配置
   */
  saveConfig() {
    localStorage.setItem('teaching_tool_config', JSON.stringify(this.config));
  },

  /**
   * 更新配置
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  },

  /**
   * 通用 API 调用
   * @param {object} payload - 请求体
   * @param {object} options - 选项
   * @returns {Promise<object>} - 响应数据
   */
  async callAPI(payload, options = {}) {
    const { apiEndpoint, apiKey, model, temperature, maxTokens } = this.config;
    
    if (!apiEndpoint || !apiKey) {
      throw new Error('API 配置未设置，请在设置中配置 API 端点和密钥');
    }

    const body = {
      model: options.model || model,
      messages: payload.messages,
      temperature: options.temperature !== undefined ? options.temperature : temperature,
      max_tokens: options.maxTokens || maxTokens
    };

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      throw error;
    }
  },

  /**
   * 调用 teaching-lesson-plan 风格的内容生成
   * 生成教案结构：教学目标、重难点、活动设计
   * @param {string} topic - 知识点
   * @param {string} subject - 学科
   * @param {string} grade - 年级
   * @param {string} difficulty - 难度
   * @returns {Promise<object>} - 结构化教案
   */
  async generateLessonPlan(topic, subject = '', grade = '', difficulty = 'basic') {
    const messages = [
      {
        role: 'system',
        content: `你是一位专业的教学设计专家。请根据提供的知识点，生成标准的教案结构。
请使用以下格式输出（JSON）：
{
  "learningObjectives": ["目标1", "目标2", "目标3"],
  "keyPoints": ["重点1", "重点2"],
  "difficultPoints": ["难点1", "难点2"],
  "teachingActivities": [
    { "phase": "导入", "time": "5分钟", "activity": "...", "format": "全班" },
    { "phase": "新授", "time": "15分钟", "activity": "...", "format": "讲解+演示" },
    { "phase": "练习", "time": "10分钟", "activity": "...", "format": "独立+小组" },
    { "phase": "总结", "time": "5分钟", "activity": "...", "format": "全班" }
  ],
  "assessment": ["评估方法1", "评估方法2"],
  "differentiation": {
    "support": ["支持策略1", "支持策略2"],
    "extension": ["拓展策略1", "拓展策略2"]
  }
}

要求：
- 教学目标使用布鲁姆动词（记忆、理解、应用、分析、评价、创造）
- 活动设计不超过30分钟
- 包含形成性评估
- 包含差异化教学策略`
      },
      {
        role: 'user',
        content: `请为以下知识点生成教案结构：

知识点：${topic}
学科：${subject || '未指定'}
年级：${grade || '未指定'}
难度：${difficulty}

请严格按照 JSON 格式输出。`
      }
    ];

    const response = await this.callAPI({ messages }, { temperature: 0.5 });
    const content = response.choices[0].message.content;
    
    // 提取 JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('JSON parse failed, returning raw content');
    }
    
    return { rawContent: content };
  },

  /**
   * 调用 teaching-notes-writing 风格的内容生成
   * 生成详细的教学讲解内容
   * @param {string} topic - 知识点
   * @param {object} lessonPlan - 教案结构
   * @param {string} difficulty - 难度
   * @returns {Promise<object>} - 详细内容
   */
  async generateTeachingNotes(topic, lessonPlan, difficulty = 'basic') {
    const messages = [
      {
        role: 'system',
        content: `你是一位优秀的学科教师，擅长编写教学讲义。请根据提供的知识点和教案结构，生成详细的教学内容。

请使用以下格式输出（JSON）：
{
  "introduction": "引入段落，从学生已有认知出发",
  "explanation": "核心知识讲解，分步解释，包含原因和道理",
  "examples": [
    {
      "title": "例题1",
      "problem": "题目描述",
      "solution": "详细解答步骤",
      "answer": "最终答案"
    }
  ],
  "practice": [
    {
      "question": "练习题",
      "hint": "提示",
      "answer": "答案"
    }
  ],
  "summary": "知识总结，强调关键概念",
  "keyVocabulary": ["术语1", "术语2"],
  "commonMisconceptions": [
    {
      "misconception": "常见误解",
      "correction": "正确理解",
      "explanation": "解释"
    }
  ]
}

要求：
- 从学生的心智模型出发，解释概念
- 在正式规则之前，先比较相近的概念
- 展示步骤时，让状态变化可见
- 把原因、警告、解释放在文字中，而不是只在图表中
- 练习题与章节内容匹配
- 答案放在学生尝试之后`
      },
      {
        role: 'user',
        content: `请为以下知识点生成详细教学讲义内容：

知识点：${topic}
教案结构：${JSON.stringify(lessonPlan, null, 2)}
难度：${difficulty}

请严格按照 JSON 格式输出，确保内容适合学生阅读。`
      }
    ];

    const response = await this.callAPI({ messages }, { temperature: 0.6, maxTokens: 2500 });
    const content = response.choices[0].message.content;
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('JSON parse failed, returning raw content');
    }
    
    return { rawContent: content };
  },

  /**
   * 生成完整的讲义内容
   * 整合教案结构 + 详细内容
   * @param {string} topic - 知识点
   * @param {object} options - 选项
   * @returns {Promise<object>} - 完整的讲义数据
   */
  async generateHandout(topic, options = {}) {
    const { subject = '', grade = '', difficulty = 'basic' } = options;
    
    // 第一步：生成教案结构
    const lessonPlan = await this.generateLessonPlan(topic, subject, grade, difficulty);
    
    // 第二步：生成详细内容
    const teachingNotes = await this.generateTeachingNotes(topic, lessonPlan, difficulty);
    
    // 合并结果
    return {
      topic,
      subject,
      grade,
      difficulty,
      ...lessonPlan,
      ...teachingNotes,
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * 检查 API 配置是否有效
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.config.apiEndpoint && this.config.apiKey);
  }
};

// 初始化
SkillCaller.loadConfig();

// 导出
window.SkillCaller = SkillCaller;
