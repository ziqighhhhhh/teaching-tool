const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// 加载环境变量
dotenv.config();

const { spawn } = require('child_process');

// 教案结构缓存（文件持久化）
const CACHE_FILE = path.join(__dirname, 'data', 'lesson_plan_cache.json');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7天

// 加载缓存文件
function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      const now = Date.now();
      for (const [key, entry] of Object.entries(data)) {
        if (now - entry.timestamp < CACHE_TTL) {
          lessonPlanCache.set(key, entry);
        }
      }
      console.log(`Loaded ${lessonPlanCache.size} cached lesson plans`);
    }
  } catch (e) {
    console.warn('Failed to load cache:', e.message);
  }
}

// 保存缓存到文件
function saveCacheToFile() {
  try {
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const data = Object.fromEntries(lessonPlanCache);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save cache:', e.message);
  }
}

// 教案缓存
const lessonPlanCache = new Map();

// 技能Prompt缓存
let lessonPlanPrompt = '';

// 加载技能Prompt
function loadSkillPrompts() {
  const skillsDir = path.join(__dirname, 'skills');
  try {
    lessonPlanPrompt = fs.readFileSync(
      path.join(skillsDir, 'teaching-lesson-plan', 'prompt.md'),
      'utf-8'
    );
    console.log('Skill prompt loaded successfully');
  } catch (e) {
    console.warn('Failed to load skill prompt:', e.message);
    lessonPlanPrompt = 'You are a teaching design expert. Generate a complete teaching handout with 7 modules.';
  }
}

// Python 检索服务管理
class PythonService {
  constructor() {
    this.process = null;
    this.ready = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('python', ['scripts/search_textbook.py'], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop();
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.status === 'ready') {
              this.ready = true;
              console.log('Python search service ready');
              resolve();
            } else if (response.requestId) {
              const pending = this.pendingRequests.get(response.requestId);
              if (pending) {
                this.pendingRequests.delete(response.requestId);
                clearTimeout(pending.timeout);
                if (response.status === 'error') {
                  pending.reject(new Error(response.message));
                } else {
                  pending.resolve(response);
                }
              }
            }
          } catch (e) {}
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error('Python stderr:', data.toString().trim());
      });

      this.process.on('close', (code) => {
        console.log(`Python service exited with code ${code}`);
        this.ready = false;
      });

      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Python service start timeout (30s)'));
        }
      }, 30000);
    });
  }

  async search(topic, subject, grade, top_k = 3) {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        reject(new Error('Python service not ready'));
        return;
      }

      const id = `req_${++this.requestId}`;
      const request = {
        requestId: id,
        action: 'search',
        topic,
        subject,
        grade,
        top_k
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Search timeout (10s)'));
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async stop() {
    if (this.process) {
      this.process.stdin.write(JSON.stringify({ action: 'exit' }) + '\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.process.kill();
    }
  }
}

const pythonService = new PythonService();
const app = express();
const PORT = process.env.PORT || 8082;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const MODELS = (process.env.LLM_MODELS || 'qwen3.7-max-2026-05-17').split(',').map(m => m.trim());
const API_KEY = process.env.LLM_API_KEY;
const BASE_URL = process.env.LLM_BASE_URL;

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', models: MODELS.length, port: PORT });
});

// 带超时的fetch
async function fetchWithTimeout(url, options, timeout = 30000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}

// 调用 LLM API（支持模型轮询）
async function callLLMWithFallback(prompt, options = {}) {
  const { temperature = 0.7, maxTokens = 2500 } = options;
  
  let lastError = null;
  
  for (const model of MODELS) {
    try {
      console.log(`Trying model: ${model}`);
      const response = await fetchWithTimeout(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: '请生成内容' }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        })
      }, 30000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      return { data, model };
    } catch (error) {
      lastError = error;
      console.log(`Model ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }
  
  throw new Error(`All models failed. Last error: ${lastError?.message}`);
}

// 生成讲义内容（单阶段，直接输出7模块）
async function generateHandoutContent(topic, grade, difficulty) {
  const cacheKey = `${topic}_${grade}_${difficulty}`;
  const cached = lessonPlanCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('Cache hit');
    return cached.data;
  }
  
  // 填充提示词变量
  const filledPrompt = lessonPlanPrompt
    .replace(/\{\{topic\}\}/g, topic)
    .replace(/\{\{grade\}\}/g, grade)
    .replace(/\{\{difficulty\}\}/g, difficulty);
  
  const { data } = await callLLMWithFallback(filledPrompt, {
    temperature: 0.5,
    maxTokens: difficulty === 'basic' ? 800 : difficulty === 'advanced' ? 1200 : 1500
  });
  
  const content = data.choices[0].message.content;
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const handoutData = JSON.parse(jsonMatch[0]);
      
      // 添加元数据
      handoutData.topic = topic;
      handoutData.grade = grade;
      handoutData.difficulty = difficulty;
      
      // 缓存并保存
      lessonPlanCache.set(cacheKey, { data: handoutData, timestamp: Date.now() });
      saveCacheToFile();
      return handoutData;
    }
  } catch (e) {
    throw new Error('讲义解析失败：' + e.message);
  }
  
  throw new Error('无法生成讲义');
}

// 生成讲义 API
app.post('/api/generate', async (req, res) => {
  const { topic, grade, difficulty = 'basic' } = req.body;
  
  if (!topic) {
    return res.status(400).json({ error: '请输入知识点' });
  }

  // 单阶段生成：直接调用LLM，输出7模块内容
  let handoutData;
  try {
    handoutData = await generateHandoutContent(topic, grade, difficulty);
    console.log('讲义生成成功');
  } catch (error) {
    console.error('讲义生成失败:', error);
    return res.status(503).json({
      error: '讲义生成失败',
      message: error.message
    });
  }
  
  return res.json({
    success: true,
    model: MODELS[0],
    data: handoutData
  });
});

// 启动服务器
async function startServer() {
  // 加载技能Prompt
  loadSkillPrompts();
  
  // 加载缓存
  loadCacheFromFile();
  
  // 尝试启动Python检索服务（非阻塞，失败不影响主流程）
  try {
    console.log('正在启动教材检索服务...');
    await pythonService.start();
    console.log('教材检索服务已就绪');
  } catch (e) {
    console.warn('教材检索服务启动失败:', e.message);
    console.warn('系统将以技能模式运行（不依赖教材检索）');
  }

  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  智能教辅讲义生成器`);
    console.log(`========================================`);
    console.log(`  服务器地址: http://localhost:${PORT}`);
    console.log(`  API 代理: ${BASE_URL}`);
    console.log(`  可用模型: ${MODELS.length} 个`);
    console.log(`  教材检索: ${pythonService.ready ? '已启用' : '未启用'}`);
    console.log(`  按 Ctrl+C 停止服务器`);
    console.log(`========================================`);
  });
}

startServer();
