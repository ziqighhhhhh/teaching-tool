# teaching-tool

智能教辅讲义生成器

## 简介

根据知识点自动生成可编辑的 HTML 讲义，支持浏览器打印导出 PDF。

## 功能

- **多种输入方式**：直接输入知识点、选择教科书章节、上传文档
- **5 种讲义风格模板**：经典课堂、知识卡片、思维导图、解题步骤、互动课堂
- **3 种主题颜色**：科技蓝、自然绿、活力橙
- **浏览器中直接编辑**：所见即所得的富文本编辑
- **一键打印导出 PDF**：A4 纸优化，页眉页脚
- **智能缓存**：SHA-256 哈希缓存，减少重复 API 调用
- **API 配置灵活**：支持 OpenAI、Claude 等多种 LLM API

## 快速开始

1. 打开 `index.html`（纯前端，无需服务器）
2. 输入知识点或选择教科书章节
3. 选择模板风格和主题
4. 点击"生成讲义"
5. 编辑内容后点击"打印 / 导出 PDF"

## 使用说明

### 演示模式

首次使用无需配置 API，工具会自动进入演示模式，生成示例讲义。

### API 配置（可选）

如需使用 AI 生成高质量讲义：
1. 点击左侧"API 配置"
2. 输入 API 端点和密钥
3. 选择模型（GPT-4、GPT-3.5、Claude）
4. 点击"保存配置"

支持的 API：
- OpenAI: `https://api.openai.com/v1/chat/completions`
- 自定义端点：支持任何兼容 OpenAI 格式的 API

### 教科书数据

当前内置 6 本数学教科书示例（七年级~九年级）。

完整教科书数据将在后续版本通过 PDF 解析自动导入。

## 项目结构

```
teaching-tool/
├── index.html              # 主入口
├── assets/
│   ├── css/
│   │   ├── base.css        # 基础样式
│   │   ├── themes.css      # 主题变量
│   │   └── templates/      # 5种模板样式
│   ├── js/                 # JavaScript 模块
│   │   ├── app.js          # 主应用逻辑
│   │   ├── cache.js        # 缓存管理
│   │   ├── editor.js       # 编辑器
│   │   ├── pdf-exporter.js # PDF 导出
│   │   ├── skill-caller.js # Skill 调用
│   │   ├── template-engine.js # 模板引擎
│   │   └── textbook-adapter.js # 教科书适配
│   └── templates/          # HTML 模板
├── data/
│   └── textbooks/          # 教科书数据
├── config/                 # 配置文件
└── docs/                   # 文档
```

## 技术栈

- 纯前端：HTML + CSS + JS（零依赖）
- CSS 自定义属性：主题系统
- contentEditable：富文本编辑
- Web Crypto API：SHA-256 哈希
- LocalStorage：缓存和配置
- window.print()：PDF 导出

## 开发阶段

- [x] Phase 1: 项目基础设施
- [x] Phase 2: 核心功能实现
- [x] Phase 3: 5 种 HTML 模板
- [x] Phase 4: 教科书数据示例
- [x] Phase 5: 编辑与 PDF 导出
- [x] Phase 6: Skill 集成与缓存优化
- [x] Phase 7: 测试与优化
- [ ] Phase 8: 全部教科书 PDF 自动解析

## 许可证

MIT
