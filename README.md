# teaching-tool

智能教辅讲义生成器

## 简介

根据知识点自动生成可编辑的 HTML 讲义，支持浏览器打印导出 PDF。

## 功能

- 输入知识点或选择教科书章节
- 自动调用 AI Skill 生成结构化讲义内容
- 5 种讲义风格模板（经典课堂、知识卡片、思维导图、解题步骤、互动课堂）
- 浏览器中直接编辑文字和样式
- 一键打印导出 PDF（A4 优化）

## 使用

1. 打开 `index.html`（纯前端，无需服务器）
2. 输入知识点或选择教科书章节
3. 选择模板风格和主题
4. 点击生成
5. 编辑内容后打印导出 PDF

## 技术栈

- 纯前端：HTML + CSS + JS（零依赖）
- Skill 协同：teaching-notes-writing、teaching-lesson-plan、frontend-slides
- 缓存：LocalStorage + SHA-256 哈希

## 项目结构

```
teaching-tool/
├── index.html              # 主入口
├── assets/
│   ├── css/
│   │   ├── base.css        # 基础样式
│   │   ├── templates/      # 模板样式
│   │   └── themes.css      # 主题变量
│   ├── js/                 # JavaScript 模块
│   └── templates/          # HTML 模板
├── data/textbooks/         # 教科书数据
├── config/                 # 配置文件
└── docs/                   # 文档
```

## 许可证

MIT
