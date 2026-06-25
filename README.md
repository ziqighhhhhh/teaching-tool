# 智能教辅讲义生成器

纯前端实现，直接调用 LLM API 生成教学讲义。

## 使用方式

1. 直接双击打开 `index.html`（无需服务器）
2. 输入知识点（如：一元一次方程）
3. 选择年级和难度
4. 点击"生成讲义"

## 文件结构

```
.
├── index.html          # 主页面
├── app.js              # 核心逻辑（调用LLM、格式化输出）
├── style.css           # 样式
├── .env                # API Key（开发阶段）
└── skills/
    └── teaching-lesson-plan/
        └── prompt.md   # LLM提示词
```

## 技术特点

- **纯前端**：无需 Node.js/Express，直接打开 HTML 即可使用
- **单文件调用**：一次 LLM 调用生成完整 7 模块讲义
- **零依赖**：无 npm 包，无构建步骤

## 开发提示

- API Key 硬编码在 `app.js` 中（仅本地开发使用）
- 提示词文件可从 `skills/` 目录加载，加载失败时使用内置备用提示词

## License

MIT
