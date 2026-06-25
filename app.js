// 讲义生成器 - 纯前端实现
// 开发阶段：API Key 直接硬编码（仅本地使用）

const API_KEY = 'sk-a181eed6bc8143a182814a63244f5759';
const API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'deepseek-v4-flash';

// 加载提示词（从 skills 目录）
async function loadPrompt() {
    try {
        const res = await fetch('skills/teaching-lesson-plan/prompt.md');
        return await res.text();
    } catch (e) {
        console.warn('Failed to load prompt, using fallback');
        return getFallbackPrompt();
    }
}

// 备用提示词（如果文件加载失败）
function getFallbackPrompt() {
    return `# 教学讲义生成

你是教师。根据知识点生成JSON格式讲义。

输入：{{topic}} {{grade}} {{difficulty}}

难度：
- basic: 1例题+2练习，300字
- advanced: 2例题+3练习，500字  
- extension: 2例题+4练习，700字

输出JSON（只返回JSON，不要其他文字）：
{
  "knowledge_overview": "HTML格式知识速览",
  "key_explanation": "HTML格式重点讲解",
  "classic_examples": [{"title":"例题1","problem":"...","analysis":"...","solution":"...","answer":"...","method_summary":"..."}],
  "variation_training": [{"question":"具体题目","hint":"..."}],
  "common_mistakes": [{"wrong":"...","correct":"...","reason":"..."}],
  "practice": {"basic":[{"question":"...","answer":"..."}],"advanced":[...],"extension":[...]},
  "summary": "HTML格式总结"
}

要求：
- 题目必须具体，禁止"设计...题"等占位符
- analysis只写思路，solution写步骤
- 使用LaTeX数学公式 $...$
- 中文输出`;
}

async function generate() {
    const topic = document.getElementById('topic').value.trim();
    const grade = document.getElementById('grade').value;
    const difficulty = document.getElementById('difficulty').value;
    
    if (!topic) {
        alert('请输入知识点');
        return;
    }
    
    const btn = document.querySelector('button');
    btn.disabled = true;
    btn.textContent = '生成中...';
    
    try {
        let prompt = await loadPrompt();
        
        // 填充变量
        prompt = prompt
            .replace(/\{\{topic\}\}/g, topic)
            .replace(/\{\{grade\}\}/g, grade)
            .replace(/\{\{difficulty\}\}/g, difficulty);
        
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: difficulty === 'basic' ? 800 : difficulty === 'advanced' ? 1200 : 1500,
                temperature: 0.5
            })
        });
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();
        const content = data.choices[0].message.content;
        
        // 提取 JSON
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error('No JSON found in response');
        }
        
        const result = JSON.parse(match[0]);
        
        // 添加元数据
        result.topic = topic;
        result.grade = grade;
        result.difficulty = difficulty;
        
        // 显示格式化输出
        document.getElementById('output').textContent = formatOutput(result);
        
    } catch (error) {
        console.error('Generation failed:', error);
        document.getElementById('output').textContent = `生成失败: ${error.message}\n\n请检查 API Key 是否有效。`;
    } finally {
        btn.disabled = false;
        btn.textContent = '生成讲义';
    }
}

function formatOutput(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty}\n\n`;
    
    text += `【知识速览】\n${stripHtml(data.knowledge_overview)}\n\n`;
    
    text += `【重点精讲】\n${stripHtml(data.key_explanation)}\n\n`;
    
    text += `【典例分析】\n`;
    (data.classic_examples || []).forEach((ex, i) => {
        text += `例题 ${i + 1}: ${ex.title}\n`;
        text += `  题目: ${ex.problem}\n`;
        text += `  分析: ${ex.analysis}\n`;
        text += `  解答: ${ex.solution}\n`;
        text += `  答案: ${ex.answer}\n`;
        text += `  方法: ${ex.method_summary}\n\n`;
    });
    
    text += `【变式训练】\n`;
    (data.variation_training || []).forEach((q, i) => {
        text += `变式 ${i + 1}: ${q.question}\n`;
        text += `  提示: ${q.hint}\n\n`;
    });
    
    text += `【易错警示】\n`;
    (data.common_mistakes || []).forEach((m, i) => {
        text += `错误 ${i + 1}:\n`;
        text += `  常见错误: ${m.wrong}\n`;
        text += `  正确做法: ${m.correct}\n`;
        text += `  原因: ${m.reason}\n\n`;
    });
    
    text += `【巩固练习】\n`;
    const practice = data.practice || {};
    if (practice.basic && practice.basic.length > 0) {
        text += '基础巩固:\n';
        practice.basic.forEach((q, i) => {
            text += `  ${i + 1}. ${q.question}\n`;
            text += `     答案: ${q.answer}\n`;
        });
        text += '\n';
    }
    if (practice.advanced && practice.advanced.length > 0) {
        text += '能力提升:\n';
        practice.advanced.forEach((q, i) => {
            text += `  ${i + 1}. ${q.question}\n`;
            text += `     答案: ${q.answer}\n`;
        });
        text += '\n';
    }
    if (practice.extension && practice.extension.length > 0) {
        text += '拓展探究:\n';
        practice.extension.forEach((q, i) => {
            text += `  ${i + 1}. ${q.question}\n`;
            text += `     答案: ${q.answer}\n`;
        });
        text += '\n';
    }
    
    text += `【归纳总结】\n${stripHtml(data.summary)}\n`;
    
    return text;
}

function stripHtml(html) {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

// 页面加载完成后初始化
window.onload = () => {
    console.log('讲义生成器已加载');
    console.log('提示：直接打开 index.html 即可使用，无需启动服务器');
};
