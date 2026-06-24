const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8082;

// 解析 JSON 请求体
app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 模型列表（按优先级排序）
const MODELS = (process.env.LLM_MODELS || 'qwen3.7-max-2026-05-17').split(',').map(m => m.trim());
const API_KEY = process.env.LLM_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL;

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', models: MODELS.length, port: PORT });
});

// 生成讲义 API（带模型轮询）
app.post('/api/generate', async (req, res) => {
  const { topic, subject, grade, difficulty = 'basic' } = req.body;
  
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  // 构建提示词
  const prompt = buildPrompt(topic, subject, grade, difficulty);
  
  // 尝试所有模型，直到成功
  let lastError = null;
  for (const model of MODELS) {
    try {
      const result = await callLLM(model, prompt);
      return res.json({
        success: true,
        model: model,
        data: result
      });
    } catch (error) {
      lastError = error;
      console.log(`Model ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }

  // 所有模型都失败
  res.status(503).json({
    error: 'All models failed',
    message: lastError?.message
  });
});

  // 调用 LLM API
async function callLLM(model, prompt) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: `You are an expert teaching assistant. Generate structured educational handout content in Chinese. Output valid JSON with these fields: topic, subject, grade, difficulty, introduction, explanation, summary, keyPoints, difficultPoints, learningObjectives, keyVocabulary, examples (array with title, problem, solution, answer), practice (array with question, hint, answer), commonMisconceptions (array with misconception, correction, explanation).`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2500
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // 解析 JSON（LLM 可能返回 markdown 代码块）
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return JSON.parse(content);
  } catch (e) {
    // 如果解析失败，返回结构化文本
    return {
      topic: prompt.split('知识点：')[1]?.split('\n')[0] || 'Untitled',
      introduction: content,
      explanation: '',
      summary: '',
      keyPoints: [],
      difficultPoints: [],
      learningObjectives: [],
      keyVocabulary: [],
      examples: [],
      practice: [],
      commonMisconceptions: []
    };
  }
}

// 构建提示词
function buildPrompt(topic, subject, grade, difficulty) {
  return `请为以下知识点生成详细的教学讲义内容：

知识点：${topic}
学科：${subject || '未指定'}
年级：${grade || '未指定'}
难度：${difficulty}

请生成标准的教学讲义结构，包含：
1. 引入（从学生已有认知出发）
2. 核心知识讲解（分步解释，包含原因和道理）
3. 例题（含详细解答）
4. 练习题（含提示和答案）
5. 常见误解及纠正
6. 知识总结

请严格按照 JSON 格式输出。`;
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  智能教辅讲义生成器`);
  console.log(`========================================`);
  console.log(`  服务器地址: http://localhost:${PORT}`);
  console.log(`  API 代理: ${BASE_URL}`);
  console.log(`  可用模型: ${MODELS.length} 个`);
  console.log(`  按 Ctrl+C 停止服务器`);
  console.log(`========================================`);
});

module.exports = app;
