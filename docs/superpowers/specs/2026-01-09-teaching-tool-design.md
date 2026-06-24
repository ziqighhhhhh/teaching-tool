# 智能教辅讲义生成器设计文档

## 项目信息

- **名称**: teaching-tool（智能教辅讲义生成器）
- **管理仓库**: https://github.com/ziqighhhhhh/teaching-tool
- **版本**: 1.0
- **创建日期**: 2026-01-09

## 目标

构建纯前端单页应用，教师输入知识点即可自动生成美观、可编辑 HTML 讲义，支持浏览器打印导出 PDF，并集成中国教科书数据辅助生成。

## 核心特性

- 零依赖，单 HTML 文件可运行
- 输入方式：文本、教科书章节选择、文件上传
- 5 种讲义风格模板（经典课堂、知识卡片、思维导图、解题步骤、互动课堂）
- 3 种主题色（科技蓝、自然绿、活力橙）
- 浏览器直接编辑文字和样式
- 浏览器打印导出 PDF（A4 优化）
- 内容哈希缓存（SHA-256 + LocalStorage），减少 Token 消耗

## 技术栈

- 纯前端：HTML + CSS + JS（零依赖）
- CSS 自定义属性 + 内联样式（支持主题切换，打印友好）
- contentEditable 编辑器（直接编辑，无重型依赖）
- Fetch API 调用 Skill API（用户配置端点）
- Web Crypto API（SHA-256 哈希）
- LocalStorage（缓存 + 配置）
- window.print() + @media print（PDF 导出）

## 架构

```
浏览器（单页应用）
├── 输入面板
│   ├── 文本输入
│   ├── 教科书级联选择（学科→年级→教科书→章节→小节）
│   └── 文件上传
├── 生成控制台
│   ├── Skill 配置（API 端点、密钥）
│   ├── 模板选择（5 种）
│   ├── 主题选择（3 种）
│   └── 难度选择（基础/进阶/拓展）
├── 编辑器 + 预览
│   ├── 富文本工具栏（加粗、斜体、字体大小）
│   ├── A4 尺寸预览（210mm × 297mm）
│   └── 打印/导出按钮
└── Skill 调用层（配置驱动）
    ├── 内容解析：teaching-lesson-plan（教案结构）
    ├── 内容生成：teaching-notes-writing（详细内容）
    ├── 模板渲染：frontend-slides + frontend-skill（HTML/CSS）
    └── 缓存：SHA-256 哈希 + LocalStorage
```

## 数据流

```
用户输入 → 预处理（提取关键词、判断学科）→ 缓存检查 → 未命中：
  → 调用 teaching-lesson-plan 生成教案结构
  → 调用 teaching-notes-writing 生成详细内容
  → 调用 LLM API 补充例题、讲解
  → 整合为结构化 JSON → 模板渲染 → 缓存存储
→ 用户编辑 → 浏览器打印 → PDF
```

## 缓存策略

- 对输入文本 + 配置做 SHA-256 哈希，作为缓存键
- LocalStorage 存储（7 天有效期，50 条上限）
- 缓存项：HTML 内容、结构化数据、时间戳、版本
- 用户可手动刷新/重新生成，缓存版本升级时自动失效

## Skill 集成

| 阶段 | Skill | 作用 |
|------|-------|------|
| 内容规划 | teaching-lesson-plan | 生成标准教案结构（教学目标、重难点、活动设计） |
| 内容生成 | teaching-notes-writing | 生成详细讲义内容（引入、讲解、例题、练习） |
| 视觉设计 | frontend-slides + frontend-skill | HTML/CSS 模板样式和排版 |
| 教科书解析 | pdf-converter-mineru | 解析 PDF 教科书为 Markdown（预处理阶段） |
| PPT 备用 | ppt-master-v5 | 如需 PPT 格式可切换 |

## 模板系统

5 种讲义风格，每种支持 3 种主题色：

| 模板 | 风格 | 适用场景 |
|------|------|----------|
| 经典课堂 | 学术风，白色背景，清晰层次 | 课堂复习、知识梳理 |
| 知识卡片 | 一页一知识点，大字体，极简 | 快速记忆、随身复习 |
| 思维导图 | 中心主题 + 分支结构 | 知识体系构建、章节总结 |
| 解题步骤 | 突出例题，分步解析 | 数学、物理、化学 |
| 互动课堂 | 留白区、讨论题、活动框 | 探究式学习、翻转课堂 |

## 教科书数据

- 来源: https://github.com/TapXWorld/ChinaTextbook
- 预处理：PDF → Markdown → 结构化 JSON
- 索引: data/textbooks/index.json（学科/年级/章节树）
- 前端：级联选择器加载，选择后自动填充知识点描述

## 项目结构

```
teaching-tool/
├── index.html                  # 主入口（单页应用）
├── assets/
│   ├── css/
│   │   ├── base.css           # 基础样式、打印优化
│   │   ├── themes.css         # 主题变量（颜色、字体）
│   │   └── templates/         # 5 种模板样式
│   ├── js/
│   │   ├── app.js             # 主应用逻辑
│   │   ├── skill-caller.js    # Skill 调用封装
│   │   ├── cache.js           # 缓存管理
│   │   ├── template-engine.js # 模板渲染引擎
│   │   ├── editor.js          # 简易编辑器
│   │   ├── pdf-exporter.js    # PDF 导出逻辑
│   │   └── textbook-adapter.js # 教科书数据适配
│   └── templates/             # 5 种 HTML 模板文件
├── data/
│   └── textbooks/             # 预处理的教科书数据
├── config/
│   └── config.json            # 用户配置（API 端点、密钥）
└── docs/
    └── superpowers/
        └── specs/             # 设计文档
```

## 接口

### Skill 调用接口

```javascript
SkillCaller.callAPI(payload, options)
SkillCaller.generateLessonPlan(topic, subject, grade, difficulty)
SkillCaller.generateTeachingNotes(topic, lessonPlan, difficulty)
SkillCaller.generateHandout(topic, options)
```

### 缓存接口

```javascript
CacheManager.hash(input)
CacheManager.generateKey(input, config)
CacheManager.get(key)
CacheManager.set(key, data)
CacheManager.getStats()
```

### 模板接口

```javascript
TemplateEngine.render(templateName, data, theme)
```

## 打印优化

- @media print 隐藏 UI 控件
- 设置页边距（上下 15mm，左右 10mm）
- 添加页眉（课程标题）和页脚（页码）
- A4 尺寸优化
- 避免内容截断

## 测试计划

1. 功能测试：纯文本输入、教科书选择、模板切换、编辑、导出
2. 缓存测试：命中、过期、手动刷新、版本升级
3. 性能测试：加载时间、生成响应时间
4. 兼容性测试：Chrome、Edge、Firefox、Safari、打印
5. 用户体验：加载动画、错误提示、帮助文档

## 后续计划

- Phase 1: 项目基础设施（当前）
- Phase 2: 核心功能（输入、Skill 调用、缓存）
- Phase 3: 5 种模板开发
- Phase 4: 教科书数据预处理与集成
- Phase 5: 编辑与 PDF 导出
- Phase 6: Skill 集成与缓存优化
- Phase 7: 测试与优化
