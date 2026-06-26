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
输出JSON：{"simple_explanation":"","life_analogy":"","knowledge_breakdown":"","student_retell":{"task":""},"typical_example":{"title":"","problem":"","analysis":"","solution":"","answer":""},"error_diagnosis":[{"wrong":"","why":"","correct":""}],"consolidation":{"basic":[{"question":"","answer":""}],"advanced":[{"question":"","answer":""}]},"common_questions":[""],"answers":[""]}
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
            document.getElementById('output').innerHTML = 
                `<div class="error">=== LLM 原始输出（未找到JSON） ===\n\n${escapeHtml(rawContent)}\n\n请检查提示词是否要求"只返回JSON"。</div>`;
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
            
            document.getElementById('output').innerHTML = `<div class="error">${escapeHtml(debugInfo)}</div>`;
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
        document.getElementById('output').innerHTML = formatter(result);
        
    } catch (error) {
        console.error('Generation failed:', error);
        document.getElementById('output').innerHTML = `<div class="error">生成失败: ${escapeHtml(error.message)}\n\n请检查 API Key 是否有效。</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '生成讲义';
    }
}

// 辅助函数：HTML转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 辅助函数：将文本转换为HTML段落（处理换行）
function textToHtml(text) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.split('\n').filter(line => line.trim()).map(line => `<p>${line}</p>`).join('');
}

// 辅助函数：高亮LaTeX公式
function highlightMath(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\$([^$]+)\$/g, '<span class="math">$1</span>');
}

// 辅助函数：将文本转为HTML段落，同时高亮公式
function contentToHtml(text) {
    if (!text) return '';
    return text.split('\n').filter(line => line.trim()).map(line => {
        const escaped = escapeHtml(line);
        const withMath = escaped.replace(/\$([^$]+)\$/g, '<span class="math-formula">$1</span>');
        return `<p>${withMath}</p>`;
    }).join('');
}

// 费曼学习法 - HTML格式化
function formatFeynman(data) {
    let html = `<div class="lecture-note">`;
    
    // 头部
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)}</div>`;
    html += `</header>`;
    
    // 简单解释
    if (data.simple_explanation) {
        html += `<section class="module simple-explanation">`;
        html += `<h2 class="module-title">简单解释</h2>`;
        html += `<div class="module-content">${contentToHtml(data.simple_explanation)}</div>`;
        html += `</section>`;
    }
    
    // 生活类比
    if (data.life_analogy) {
        html += `<section class="module life-analogy">`;
        html += `<h2 class="module-title">生活类比</h2>`;
        html += `<div class="module-content">${contentToHtml(data.life_analogy)}</div>`;
        html += `</section>`;
    }
    
    // 知识拆解
    if (data.knowledge_breakdown) {
        html += `<section class="module knowledge-breakdown">`;
        html += `<h2 class="module-title">知识拆解</h2>`;
        html += `<div class="module-content">${contentToHtml(data.knowledge_breakdown)}</div>`;
        html += `</section>`;
    }
    
    // 学生复述
    if (data.student_retell && data.student_retell.task) {
        html += `<section class="module student-retell">`;
        html += `<h2 class="module-title">学生复述</h2>`;
        html += `<div class="module-content task-box">`;
        html += `<p class="task-label">💡 任务</p>`;
        html += `<p>${escapeHtml(data.student_retell.task)}</p>`;
        html += `</div>`;
        html += `</section>`;
    }
    
    // 典型例题
    if (data.typical_example) {
        const ex = data.typical_example;
        html += `<section class="module typical-example">`;
        html += `<h2 class="module-title">典型例题</h2>`;
        html += `<div class="module-content">`;
        html += `<div class="example-card">`;
        if (ex.title) html += `<h3 class="example-title">${escapeHtml(ex.title)}</h3>`;
        if (ex.problem) {
            html += `<div class="example-section">`;
            html += `<span class="section-label">题目</span>`;
            html += `<div class="problem-text">${contentToHtml(ex.problem)}</div>`;
            html += `</div>`;
        }
        if (ex.analysis) {
            html += `<div class="example-section">`;
            html += `<span class="section-label">分析</span>`;
            html += `<div>${contentToHtml(ex.analysis)}</div>`;
            html += `</div>`;
        }
        if (ex.solution) {
            html += `<div class="example-section">`;
            html += `<span class="section-label">解答</span>`;
            html += `<div>${contentToHtml(ex.solution)}</div>`;
            html += `</div>`;
        }
        if (ex.answer) {
            html += `<div class="example-section answer">`;
            html += `<span class="section-label">答案</span>`;
            html += `<div class="answer-text">${contentToHtml(ex.answer)}</div>`;
            html += `</div>`;
        }
        html += `</div></div></section>`;
    }
    
    // 易错诊断
    if (data.error_diagnosis && data.error_diagnosis.length > 0) {
        html += `<section class="module error-diagnosis">`;
        html += `<h2 class="module-title">易错诊断</h2>`;
        html += `<div class="module-content">`;
        data.error_diagnosis.forEach((m, i) => {
            html += `<div class="error-card">`;
            html += `<div class="error-header">`;
            html += `<span class="error-number">${i + 1}</span>`;
            html += `<span class="error-tag">常见错误</span>`;
            html += `</div>`;
            if (m.wrong) html += `<p class="error-wrong">${contentToHtml(m.wrong)}</p>`;
            if (m.why) {
                html += `<div class="error-why">`;
                html += `<span class="why-label">为什么会错：</span>`;
                html += `<span>${escapeHtml(m.why)}</span>`;
                html += `</div>`;
            }
            if (m.correct) {
                html += `<div class="error-correct">`;
                html += `<span class="correct-label">✓ 正确理解：</span>`;
                html += `<span>${escapeHtml(m.correct)}</span>`;
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `</div></section>`;
    }
    
    // 巩固练习
    const consolidation = data.consolidation || {};
    if ((consolidation.basic && consolidation.basic.length > 0) || 
        (consolidation.advanced && consolidation.advanced.length > 0)) {
        html += `<section class="module consolidation">`;
        html += `<h2 class="module-title">巩固练习</h2>`;
        html += `<div class="module-content">`;
        
        if (consolidation.basic && consolidation.basic.length > 0) {
            html += `<h3 class="practice-level">基础巩固</h3>`;
            html += `<div class="practice-list">`;
            consolidation.basic.forEach((q, i) => {
                html += `<div class="practice-item">`;
                html += `<div class="practice-question">`;
                html += `<span class="practice-number">${i + 1}</span>`;
                html += `<span>${contentToHtml(q.question)}</span>`;
                html += `</div>`;
                if (q.answer) {
                    html += `<div class="practice-answer">`;
                    html += `<span class="answer-label">答案：</span>`;
                    html += `<span>${contentToHtml(q.answer)}</span>`;
                    html += `</div>`;
                }
                html += `</div>`;
            });
            html += `</div>`;
        }
        
        if (consolidation.advanced && consolidation.advanced.length > 0) {
            html += `<h3 class="practice-level">能力提升</h3>`;
            html += `<div class="practice-list">`;
            consolidation.advanced.forEach((q, i) => {
                html += `<div class="practice-item">`;
                html += `<div class="practice-question">`;
                html += `<span class="practice-number">${i + 1}</span>`;
                html += `<span>${contentToHtml(q.question)}</span>`;
                html += `</div>`;
                if (q.answer) {
                    html += `<div class="practice-answer">`;
                    html += `<span class="answer-label">答案：</span>`;
                    html += `<span>${contentToHtml(q.answer)}</span>`;
                    html += `</div>`;
                }
                html += `</div>`;
            });
            html += `</div>`;
        }
        
        html += `</div></section>`;
    }
    
    // 常见问题
    if (data.common_questions && data.common_questions.length > 0) {
        html += `<section class="module common-questions">`;
        html += `<h2 class="module-title">常见问题</h2>`;
        html += `<div class="module-content">`;
        data.common_questions.forEach((q, i) => {
            html += `<div class="qa-item">`;
            html += `<div class="question">`;
            html += `<span class="qa-label q">Q</span>`;
            html += `<span>${escapeHtml(q)}</span>`;
            html += `</div>`;
            if (data.answers && data.answers[i]) {
                html += `<div class="answer">`;
                html += `<span class="qa-label a">A</span>`;
                html += `<span>${escapeHtml(data.answers[i])}</span>`;
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `</div></section>`;
    }
    
    html += `</div>`;
    return html;
}

// 其他方法的占位格式化（后续完善）
function formatSQ3R(data) {
    let html = `<div class="lecture-note">`;
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)} · SQ3R阅读法</div>`;
    html += `</header>`;
    
    if (data.survey) {
        html += `<section class="module"><h2 class="module-title">Survey 浏览</h2><div class="module-content">${contentToHtml(data.survey)}</div></section>`;
    }
    
    if (data.questions && data.questions.length > 0) {
        html += `<section class="module"><h2 class="module-title">Question 提问</h2><div class="module-content"><ol>${data.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}</ol></div></section>`;
    }
    
    if (data.key_points && data.key_points.length > 0) {
        html += `<section class="module"><h2 class="module-title">Read 精读</h2><div class="module-content"><ol>${data.key_points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ol></div></section>`;
    }
    
    if (data.recite) {
        html += `<section class="module"><h2 class="module-title">Recite 复述</h2><div class="module-content">${contentToHtml(data.recite)}</div></section>`;
    }
    
    if (data.review && data.review.length > 0) {
        html += `<section class="module"><h2 class="module-title">Review 回顾</h2><div class="module-content"><ul>${data.review.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul></div></section>`;
    }
    
    html += `</div>`;
    return html;
}

function formatCornell(data) {
    let html = `<div class="lecture-note">`;
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)} · 康奈尔笔记法</div>`;
    html += `</header>`;
    
    if (data.cue_column && data.cue_column.length > 0) {
        html += `<section class="module"><h2 class="module-title">线索栏</h2><div class="module-content"><ul>${data.cue_column.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div></section>`;
    }
    
    if (data.note_column) {
        html += `<section class="module"><h2 class="module-title">笔记栏</h2><div class="module-content">${contentToHtml(data.note_column)}</div></section>`;
    }
    
    if (data.summary) {
        html += `<section class="module"><h2 class="module-title">总结</h2><div class="module-content">${contentToHtml(data.summary)}</div></section>`;
    }
    
    html += `</div>`;
    return html;
}

function formatMindmap(data) {
    let html = `<div class="lecture-note">`;
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)} · 思维导图法</div>`;
    html += `</header>`;
    
    if (data.central_topic) {
        html += `<section class="module"><h2 class="module-title">中心主题</h2><div class="module-content"><p class="central-topic">${escapeHtml(data.central_topic)}</p></div></section>`;
    }
    
    if (data.main_branches && data.main_branches.length > 0) {
        data.main_branches.forEach((b, i) => {
            html += `<section class="module"><h2 class="module-title">分支 ${i + 1}：${escapeHtml(b.branch)}</h2>`;
            if (b.sub_branches && b.sub_branches.length > 0) {
                html += `<div class="module-content"><ul>${b.sub_branches.map(sb => `<li>${escapeHtml(sb)}</li>`).join('')}</ul></div>`;
            }
            html += `</section>`;
        });
    }
    
    html += `</div>`;
    return html;
}

function formatActiveRecall(data) {
    let html = `<div class="lecture-note">`;
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)} · 主动回忆法</div>`;
    html += `</header>`;
    
    if (data.recall_questions && data.recall_questions.length > 0) {
        html += `<section class="module"><h2 class="module-title">回忆题</h2><div class="module-content">`;
        data.recall_questions.forEach((q, i) => {
            html += `<div class="practice-item">`;
            html += `<div class="practice-question"><span class="practice-number">${i + 1}</span><span>${escapeHtml(q.question)}</span></div>`;
            if (q.hint) html += `<div class="hint">💡 提示：${escapeHtml(q.hint)}</div>`;
            html += `</div>`;
        });
        html += `</div></section>`;
    }
    
    if (data.fill_in_blank && data.fill_in_blank.length > 0) {
        html += `<section class="module"><h2 class="module-title">填空</h2><div class="module-content">`;
        data.fill_in_blank.forEach((f, i) => {
            html += `<div class="practice-item">`;
            html += `<div class="practice-question"><span class="practice-number">${i + 1}</span><span>${escapeHtml(f.sentence)}</span></div>`;
            if (f.answer) html += `<div class="practice-answer"><span class="answer-label">答案：</span><span>${escapeHtml(f.answer)}</span></div>`;
            html += `</div>`;
        });
        html += `</div></section>`;
    }
    
    if (data.self_check && data.self_check.length > 0) {
        html += `<section class="module"><h2 class="module-title">自检</h2><div class="module-content"><ul>${data.self_check.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div></section>`;
    }
    
    html += `</div>`;
    return html;
}

function formatDeliberate(data) {
    let html = `<div class="lecture-note">`;
    html += `<header class="note-header">`;
    html += `<h1>${escapeHtml(data.topic)}</h1>`;
    html += `<div class="note-meta">${escapeHtml(data.grade)} · ${escapeHtml(data.difficulty)} · 刻意练习法</div>`;
    html += `</header>`;
    
    if (data.focus_area) {
        html += `<section class="module"><h2 class="module-title">聚焦弱点</h2><div class="module-content">${contentToHtml(data.focus_area)}</div></section>`;
    }
    
    if (data.progression && data.progression.length > 0) {
        html += `<section class="module"><h2 class="module-title">难度递进</h2><div class="module-content">`;
        data.progression.forEach((p, i) => {
            html += `<div class="example-card">`;
            html += `<h3 class="example-title">${escapeHtml(p.level)}</h3>`;
            html += `<div class="example-section"><span class="section-label">题目</span><div>${contentToHtml(p.question)}</div></div>`;
            if (p.answer) html += `<div class="example-section answer"><span class="section-label">答案</span><div class="answer-text">${contentToHtml(p.answer)}</div></div>`;
            html += `</div>`;
        });
        html += `</div></section>`;
    }
    
    if (data.feedback && data.feedback.length > 0) {
        html += `<section class="module"><h2 class="module-title">反馈提示</h2><div class="module-content"><ul>${data.feedback.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div></section>`;
    }
    
    if (data.challenge && data.challenge.question) {
        html += `<section class="module"><h2 class="module-title">挑战题</h2><div class="module-content">`;
        html += `<div class="example-card">`;
        html += `<div class="example-section"><span class="section-label">题目</span><div>${contentToHtml(data.challenge.question)}</div></div>`;
        if (data.challenge.answer) html += `<div class="example-section answer"><span class="section-label">答案</span><div class="answer-text">${contentToHtml(data.challenge.answer)}</div></div>`;
        html += `</div></div></section>`;
    }
    
    html += `</div>`;
    return html;
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