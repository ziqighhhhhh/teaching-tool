// 讲义生成器 - 纯前端 + 最小代理
// 开发阶段：运行 `node serve.js` 启动代理服务器

const API_URL = 'http://localhost:8082/api/generate';

// 加载提示词（根据材料目的）
async function loadPrompt(purpose) {
    try {
        const res = await fetch(`skills/${purpose}/prompt.md`);
        return await res.text();
    } catch (e) {
        console.warn(`Failed to load ${purpose}, using fallback`);
        return getFallbackPrompt(purpose);
    }
}

// 备用提示词
function getFallbackPrompt(purpose) {
    const fallbacks = {
        'feynman-method': `# 费曼学习法
你是教师。根据知识点生成JSON格式讲义。
输入：{{topic}} {{grade}} {{difficulty}}
难度：basic=基础语言，advanced=适度术语，extension=拔高
输出JSON：{"simple_explanation":"","life_analogy":"","knowledge_breakdown":"","student_retell":{"task":""},"typical_example":{"title":"","problem":"","analysis":"","solution":"","answer":""},"error_diagnosis":[{"wrong":"","why":"","correct":""}],"consolidation":{"basic":[{"question":"","answer":""}],"advanced":[{"question":"","answer":""}]},"teacher_guide":{"teaching_points":[""],"time_allocation":{"explanation":"5min","analogy":"3min","breakdown":"5min","retell":"5min","example":"8min","diagnosis":"3min","practice":"6min"},"common_questions":[""],"answers":[""]}}
要求：语言简单像聊天，每个概念必须有生活类比，学生复述环节只用一句话引导，使用LaTeX公式 $...$，中文输出，只返回JSON`,
        
        'sq3r-method': `# SQ3R阅读法
输入：{{topic}} {{grade}} {{difficulty}}
输出JSON：{"survey":"","questions":[""],"key_points":[""],"recite":"","review":[""]}
要求：中文输出，只返回JSON`,
        
        'cornell-method': `# 康奈尔笔记法
输入：{{topic}} {{grade}} {{difficulty}}
输出JSON：{"cue_column":[""],"note_column":"","summary":""}
要求：中文输出，只返回JSON`,
        
        'mindmap-method': `# 思维导图法
输入：{{topic}} {{grade}} {{difficulty}}
输出JSON：{"central_topic":"","main_branches":[{"branch":"","sub_branches":[""]}]}
要求：中文输出，只返回JSON`,
        
        'active-recall': `# 主动回忆法
输入：{{topic}} {{grade}} {{difficulty}}
输出JSON：{"recall_questions":[{"question":"","hint":""}],"fill_in_blank":[{"sentence":"","answer":""}],"self_check":[""]}
要求：中文输出，只返回JSON`,
        
        'deliberate-practice': `# 刻意练习法
输入：{{topic}} {{grade}} {{difficulty}}
输出JSON：{"focus_area":"","progression":[{"level":"","question":"","answer":""}],"feedback":[""],"challenge":{"question":"","answer":""}}
要求：中文输出，只返回JSON`
    };
    return fallbacks[purpose] || fallbacks['feynman-method'];
}

async function generate() {
    const topic = document.getElementById('topic').value.trim();
    const grade = document.getElementById('grade').value;
    const difficulty = document.getElementById('difficulty').value;
    const purpose = document.getElementById('purpose').value;
    
    if (!topic) {
        alert('请输入知识点');
        return;
    }
    
    const btn = document.querySelector('button');
    btn.disabled = true;
    btn.textContent = '生成中...';
    
    try {
        let prompt = await loadPrompt(purpose);
        
        // 填充变量
        prompt = prompt
            .replace(/\{\{topic\}\}/g, topic)
            .replace(/\{\{grade\}\}/g, grade)
            .replace(/\{\{difficulty\}\}/g, difficulty);
        
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: topic,
                grade: grade,
                difficulty: difficulty,
                purpose: purpose
            })
        });
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        
        const data = await res.json();
        
        // 获取LLM原始输出
        const rawContent = data.raw || '';
        
        if (!rawContent) {
            throw new Error('No content from LLM');
        }
        
        // 提取 JSON（LLM可能在JSON前后加了Markdown标记或其他文字）
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            // 如果没有找到JSON，显示原始内容以便调试
            document.getElementById('output').textContent = 
                `=== LLM 原始输出（未找到JSON） ===\n\n${rawContent}\n\n请检查提示词是否要求"只返回JSON"。`;
            btn.disabled = false;
            btn.textContent = '生成讲义';
            return;
        }
        
        let result;
        try {
            result = JSON.parse(jsonMatch[0]);
        } catch (jsonError) {
            // JSON解析失败，显示原始内容和错误位置
            const errorPos = jsonError.message.match(/position (\d+)/)?.[1];
            let debugInfo = `JSON解析错误: ${jsonError.message}\n\n`;
            if (errorPos) {
                const start = Math.max(0, parseInt(errorPos) - 50);
                const end = Math.min(rawContent.length, parseInt(errorPos) + 50);
                debugInfo += `错误位置附近:\n...${rawContent.slice(start, end)}...\n`;
                debugInfo += `         ${' '.repeat(Math.min(50, parseInt(errorPos) - start))}^ 错误在这里\n\n`;
            }
            debugInfo += `=== 完整原始输出 ===\n${rawContent}`;
            
            document.getElementById('output').textContent = debugInfo;
            btn.disabled = false;
            btn.textContent = '生成讲义';
            return;
        }
        
        // 添加元数据
        result.topic = topic;
        result.grade = grade;
        result.difficulty = difficulty;
        result.purpose = purpose;
        
        // 根据目的选择格式化函数
        const formatters = {
            'feynman-method': formatFeynman,
            'sq3r-method': formatSQ3R,
            'cornell-method': formatCornell,
            'mindmap-method': formatMindmap,
            'active-recall': formatActiveRecall,
            'deliberate-practice': formatDeliberate
        };
        
        const formatter = formatters[purpose] || formatFeynman;
        document.getElementById('output').textContent = formatter(result);
        
    } catch (error) {
        console.error('Generation failed:', error);
        document.getElementById('output').textContent = `生成失败: ${error.message}\n\n请检查 API Key 是否有效。`;
    } finally {
        btn.disabled = false;
        btn.textContent = '生成讲义';
    }
}

// 费曼学习法 - 8模块格式化
function formatFeynman(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: 费曼学习法\n\n`;
    
    text += `【简单解释】\n${stripHtml(data.simple_explanation)}\n\n`;
    
    text += `【生活类比】\n${stripHtml(data.life_analogy)}\n\n`;
    
    text += `【知识拆解】\n${stripHtml(data.knowledge_breakdown)}\n\n`;
    
    text += `【学生复述】\n`;
    if (data.student_retell) {
        text += `任务：${data.student_retell.task}\n\n`;
    }
    
    text += `【典型例题】\n`;
    if (data.typical_example) {
        const ex = data.typical_example;
        text += `${ex.title || '例题'}\n`;
        text += `  题目: ${ex.problem || ''}\n`;
        text += `  分析: ${ex.analysis || ''}\n`;
        text += `  解答: ${ex.solution || ''}\n`;
        text += `  答案: ${ex.answer || ''}\n\n`;
    }
    
    text += `【易错诊断】\n`;
    (data.error_diagnosis || []).forEach((m, i) => {
        text += `错误 ${i + 1}:\n`;
        text += `  常见错误: ${m.wrong || ''}\n`;
        text += `  为什么会错: ${m.why || ''}\n`;
        text += `  正确理解: ${m.correct || ''}\n\n`;
    });
    
    text += `【巩固练习】\n`;
    const consolidation = data.consolidation || {};
    if (consolidation.basic && consolidation.basic.length > 0) {
        text += '基础巩固:\n';
        consolidation.basic.forEach((q, i) => {
            text += `  ${i + 1}. ${q.question}\n`;
            text += `     答案: ${q.answer}\n`;
        });
        text += '\n';
    }
    if (consolidation.advanced && consolidation.advanced.length > 0) {
        text += '能力提升:\n';
        consolidation.advanced.forEach((q, i) => {
            text += `  ${i + 1}. ${q.question}\n`;
            text += `     答案: ${q.answer}\n`;
        });
        text += '\n';
    }
    
    text += `【教师使用建议】\n`;
    if (data.teacher_guide) {
        const tg = data.teacher_guide;
        text += `教学要点:\n`;
        (tg.teaching_points || []).forEach(p => text += `  - ${p}\n`);
        
        text += `\n时间分配:\n`;
        if (tg.time_allocation) {
            const ta = tg.time_allocation;
            text += `  简单解释: ${ta.explanation || '5min'}\n`;
            text += `  生活类比: ${ta.analogy || '3min'}\n`;
            text += `  知识拆解: ${ta.breakdown || '5min'}\n`;
            text += `  学生复述: ${ta.retell || '5min'}\n`;
            text += `  典型例题: ${ta.example || '8min'}\n`;
            text += `  易错诊断: ${ta.diagnosis || '3min'}\n`;
            text += `  巩固练习: ${ta.practice || '6min'}\n`;
        }
        
        text += `\n常见问题:\n`;
        (tg.common_questions || []).forEach((q, i) => {
            text += `  Q: ${q}\n`;
            if (tg.answers && tg.answers[i]) {
                text += `  A: ${tg.answers[i]}\n`;
            }
        });
    }
    
    return text;
}

// 其他方法的占位格式化（后续完善）
function formatSQ3R(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: SQ3R阅读法\n\n`;
    text += `【Survey 浏览】\n${stripHtml(data.survey)}\n\n`;
    text += `【Question 提问】\n`;
    (data.questions || []).forEach((q, i) => text += `  ${i + 1}. ${q}\n`);
    text += `\n【Read 精读】\n`;
    (data.key_points || []).forEach((p, i) => text += `  ${i + 1}. ${p}\n`);
    text += `\n【Recite 复述】\n${data.recite}\n\n`;
    text += `【Review 回顾】\n`;
    (data.review || []).forEach((r, i) => text += `  ${i + 1}. ${r}\n`);
    return text;
}

function formatCornell(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: 康奈尔笔记法\n\n`;
    text += `【线索栏】\n`;
    (data.cue_column || []).forEach((c, i) => text += `  ${i + 1}. ${c}\n`);
    text += `\n【笔记栏】\n${stripHtml(data.note_column)}\n\n`;
    text += `【总结】\n${data.summary}`;
    return text;
}

function formatMindmap(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: 思维导图法\n\n`;
    text += `中心主题: ${data.central_topic}\n\n`;
    (data.main_branches || []).forEach((b, i) => {
        text += `分支 ${i + 1}: ${b.branch}\n`;
        (b.sub_branches || []).forEach((sb, j) => {
            text += `  - ${sb}\n`;
        });
    });
    return text;
}

function formatActiveRecall(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: 主动回忆法\n\n`;
    text += `【回忆题】\n`;
    (data.recall_questions || []).forEach((q, i) => {
        text += `  ${i + 1}. ${q.question}\n`;
        text += `     提示: ${q.hint}\n`;
    });
    text += `\n【填空】\n`;
    (data.fill_in_blank || []).forEach((f, i) => {
        text += `  ${i + 1}. ${f.sentence}\n`;
        text += `     答案: ${f.answer}\n`;
    });
    text += `\n【自检】\n`;
    (data.self_check || []).forEach((s, i) => text += `  ${i + 1}. ${s}\n`);
    return text;
}

function formatDeliberate(data) {
    let text = `=== ${data.topic} ===\n`;
    text += `年级: ${data.grade} | 难度: ${data.difficulty} | 方法: 刻意练习法\n\n`;
    text += `【聚焦弱点】\n${data.focus_area}\n\n`;
    text += `【难度递进】\n`;
    (data.progression || []).forEach((p, i) => {
        text += `${p.level}\n`;
        text += `  题目: ${p.question}\n`;
        text += `  答案: ${p.answer}\n\n`;
    });
    text += `【反馈提示】\n`;
    (data.feedback || []).forEach((f, i) => text += `  ${i + 1}. ${f}\n`);
    if (data.challenge && data.challenge.question) {
        text += `\n【挑战题】\n${data.challenge.question}\n`;
        text += `答案: ${data.challenge.answer}\n`;
    }
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
    console.log('提示：运行 node serve.js 后访问 http://localhost:8082');
};