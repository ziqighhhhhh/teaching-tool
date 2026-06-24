const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// 加载环境变量
dotenv.config();

const { spawn } = require('child_process');

// 学科推断缓存（内存缓存）
const subjectCache = new Map();

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
let teachingNotesPrompt = '';

// 加载技能Prompt
function loadSkillPrompts() {
  const skillsDir = path.join(__dirname, 'skills');
  try {
    lessonPlanPrompt = fs.readFileSync(
      path.join(skillsDir, 'teaching-lesson-plan', 'prompt.md'),
      'utf-8'
    );
    teachingNotesPrompt = fs.readFileSync(
      path.join(skillsDir, 'teaching-notes-writing', 'prompt.md'),
      'utf-8'
    );
    console.log('Skill prompts loaded successfully');
  } catch (e) {
    console.warn('Failed to load skill prompts:', e.message);
    // Fallback prompts
    lessonPlanPrompt = 'You are a teaching design expert. Generate a lesson plan structure.';
    teachingNotesPrompt = 'You are an excellent teacher. Generate detailed teaching notes.';
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

// 推断学科
async function inferSubject(topic) {
  if (subjectCache.has(topic)) {
    console.log(`Subject cache hit: ${topic} -> ${subjectCache.get(topic)}`);
    return subjectCache.get(topic);
  }
  
  const prompt = `请判断以下知识点属于哪个学科。只返回学科名称，不要解释。

可选学科：数学、语文、英语、物理、化学、生物、历史、地理、政治

知识点：${topic}`;
  
  const { data } = await callLLMWithFallback(prompt, {
    temperature: 0.1,
    maxTokens: 10
  });
  
  const content = data.choices[0].message.content.trim();
  const validSubjects = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  
  let inferredSubject = null;
  
  if (validSubjects.includes(content)) {
    inferredSubject = content;
  } else {
    for (const subject of validSubjects) {
      if (content.includes(subject)) {
        inferredSubject = subject;
        break;
      }
    }
  }
  
  if (!inferredSubject) {
    throw new Error('无法判断学科');
  }
  
  subjectCache.set(topic, inferredSubject);
  return inferredSubject;
}

// 生成教案结构（带缓存，支持模型轮询）
async function generateLessonPlan(topic, subject, grade, difficulty) {
  const cacheKey = `${topic}_${subject}_${grade}_${difficulty}`;
  const cached = lessonPlanCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log('Lesson plan cache hit');
    return cached.data;
  }
  
  const prompt = `${lessonPlanPrompt}\n\n知识点：${topic}\n学科：${subject}\n年级：${grade}\n难度：${difficulty}`;
  
  const { data } = await callLLMWithFallback(prompt, {
    temperature: 0.5,
    maxTokens: 800
  });
  
  const content = data.choices[0].message.content;
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const lessonPlan = JSON.parse(jsonMatch[0]);
      // 缓存并保存
      lessonPlanCache.set(cacheKey, { data: lessonPlan, timestamp: Date.now() });
      saveCacheToFile();
      return lessonPlan;
    }
  } catch (e) {
    throw new Error('教案结构解析失败：' + e.message);
  }
  
  throw new Error('无法生成教案结构');
}

// 生成详细内容（支持模型轮询）
async function generateTeachingNotes(topic, lessonPlan, subject, grade, difficulty) {
  const prompt = `${teachingNotesPrompt}\n\n知识点：${topic}\n学科：${subject}\n年级：${grade}\n难度：${difficulty}\n\n教案结构：${JSON.stringify(lessonPlan)}`;
  
  const { data } = await callLLMWithFallback(prompt, {
    temperature: 0.6,
    maxTokens: 1500
  });
  
  const content = data.choices[0].message.content;
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    throw new Error('详细内容解析失败：' + e.message);
  }
  
  throw new Error('无法生成详细内容');
}

// 合并为7模块结构
function mergeToSevenModules(lessonPlan, teachingNotes, topic, subject, grade, difficulty) {
  return {
    topic: topic,
    subject: subject,
    grade: grade,
    difficulty: difficulty,
    
    knowledge_overview: `<ul><li><strong>学习目标：</strong>${(lessonPlan.learningObjectives || []).join('；')}</li><li><strong>核心概念：</strong>${topic}</li><li><strong>基本要求：</strong>理解并掌握${topic}</li></ul>`,
    
    key_explanation: `<p><strong>一、定义与概念</strong></p><p>${teachingNotes.introduction || ''}</p><p><strong>二、核心知识</strong></p><p>${teachingNotes.explanation || ''}</p>`,
    
    classic_examples: (teachingNotes.examples || []).map(ex => ({
      title: ex.title || '例题',
      problem: ex.problem || '',
      analysis: ex.solution || '',
      solution: ex.solution || '',
      answer: ex.answer || '',
      method_summary: '掌握解题方法'
    })),
    
    variation_training: (lessonPlan.differentiation?.extension || []).slice(0, 2).map((ext, i) => ({
      question: typeof ext === 'string' ? ext : `变式${i + 1}：${ext}`,
      hint: '注意知识点的灵活应用'
    })),
    
    common_mistakes: (teachingNotes.commonMisconceptions || []).map(cm => ({
      wrong: cm.misconception || '',
      correct: cm.correction || '',
      reason: cm.explanation || ''
    })),
    
    practice: {
      basic: (teachingNotes.practice || []).slice(0, 2).map(q => ({
        question: q.question || '',
        answer: q.answer || ''
      })),
      advanced: (teachingNotes.practice || []).slice(2, 3).map(q => ({
        question: q.question || '',
        answer: q.answer || ''
      })),
      extension: (lessonPlan.differentiation?.extension || []).slice(0, 1).map(q => ({
        question: typeof q === 'string' ? q : '拓展题',
        answer: '拓展思考'
      }))
    },
    
    summary: `<p><strong>知识网络：</strong>${topic}与前后知识的联系</p><p><strong>核心要点：</strong>${(lessonPlan.keyPoints || []).join('、')}</p><p><strong>学习方法：</strong>${teachingNotes.summary || ''}</p>`
  };
}

// 生成讲义 API
app.post('/api/generate', async (req, res) => {
  const { topic, grade, difficulty = 'basic' } = req.body;
  
  if (!topic) {
    return res.status(400).json({ error: '请输入知识点' });
  }

  // 推断学科
  let subject = '数学';
  try {
    subject = await inferSubject(topic);
    console.log(`推断学科：${topic} → ${subject}`);
  } catch (error) {
    console.warn('学科推断失败，使用默认：数学');
  }

  // 步骤1：生成教案结构（第一次LLM调用，带缓存和模型轮询）
  let lessonPlan;
  try {
    lessonPlan = await generateLessonPlan(topic, subject, grade, difficulty);
    console.log('教案结构生成成功');
  } catch (error) {
    console.error('教案结构生成失败:', error);
    return res.status(503).json({
      error: '教案结构生成失败',
      message: error.message
    });
  }

  // 步骤2：生成详细内容（第二次LLM调用，带模型轮询）
  let teachingNotes;
  try {
    teachingNotes = await generateTeachingNotes(topic, lessonPlan, subject, grade, difficulty);
    console.log('详细内容生成成功');
  } catch (error) {
    console.error('详细内容生成失败:', error);
    return res.status(503).json({
      error: '详细内容生成失败',
      message: error.message
    });
  }

  // 合并为7模块
  const mergedData = mergeToSevenModules(lessonPlan, teachingNotes, topic, subject, grade, difficulty);
  
  return res.json({
    success: true,
    model: MODELS[0],
    data: mergedData
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
