const http = require('http');
const fs = require('fs');
const path = require('path');

// 从 .env 读取配置
const env = fs.readFileSync('.env', 'utf-8');
const API_KEY = env.match(/LLM_API_KEY=(.+)/)?.[1]?.trim() || '';
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODELS = env.match(/LLM_MODELS=(.+)/)?.[1]?.split(',').map(m => m.trim()) || ['qwen3.6-flash'];
const PORT = 8082;

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  
  if (req.url === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      // 模型轮询：尝试多个模型直到成功
      let lastError = null;
      for (const model of MODELS) {
        try {
          console.log(`Trying model: ${model}`);
          
          const bodyObj = JSON.parse(body);
          bodyObj.model = model; // 替换为当前尝试的模型
          
          const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(bodyObj)
          });
          
          const data = await response.json();
          
          // 检查是否是额度耗尽错误
          if (data.error?.code === 'AllocationQuota.FreeTierOnly') {
            console.log(`Model ${model} quota exhausted, trying next...`);
            lastError = data.error.message;
            continue;
          }
          
          // 成功或返回了错误信息
          console.log(`Model ${model} response received`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
          
        } catch (e) {
          console.error(`Model ${model} failed:`, e.message);
          lastError = e.message;
          continue;
        }
      }
      
      // 所有模型都失败
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'All models failed', 
        message: lastError || 'Unknown error' 
      }));
    });
    return;
  }
  
  // 静态文件服务
  const file = req.url === '/' ? 'index.html' : req.url.slice(1);
  try {
    const content = await fs.promises.readFile(path.join(__dirname, file));
    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Models available: ${MODELS.length}`);
});