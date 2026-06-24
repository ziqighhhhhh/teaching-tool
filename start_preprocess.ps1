# 智能教辅 - 教材预处理启动脚本
# 在独立 PowerShell 窗口中运行预处理流程

param(
    [switch]$All,
    [switch]$Scan,
    [switch]$Parse,
    [switch]$Vectorize,
    [switch]$Status,
    [switch]$Reset
)

# 设置编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   智能教辅 - 教材预处理服务" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Python
$pythonExists = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonExists) {
    Write-Host "[错误] Python 未安装或未加入 PATH" -ForegroundColor Red
    Read-Host "按 Enter 键关闭"
    exit 1
}

Write-Host "[1/5] 检查完成，Python 环境就绪" -ForegroundColor Green
Write-Host ""

# 检查依赖
Write-Host "[2/5] 检查 Python 依赖..." -ForegroundColor Yellow
$checkDeps = python -c "import chromadb, sentence_transformers, pdfplumber" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[提示] 正在安装 Python 依赖..." -ForegroundColor Yellow
    pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        Read-Host "按 Enter 键关闭"
        exit 1
    }
}
Write-Host "[3/5] 依赖检查完成" -ForegroundColor Green
Write-Host ""

# 根据参数执行
if ($All) {
    Write-Host "[全量处理] 开始执行所有阶段..." -ForegroundColor Cyan
    python scripts\preprocess.py --all --resume --dashboard
}
elseif ($Scan) {
    Write-Host "[扫描] 开始扫描PDF元数据..." -ForegroundColor Cyan
    python scripts\preprocess.py --phase 1
}
elseif ($Parse) {
    Write-Host "[解析] 开始解析PDF内容..." -ForegroundColor Cyan
    python scripts\preprocess.py --phase 2 --resume
}
elseif ($Vectorize) {
    Write-Host "[向量化] 开始构建向量索引..." -ForegroundColor Cyan
    python scripts\preprocess.py --phase 3 --resume
}
elseif ($Status) {
    Write-Host "[状态] 查看当前处理状态..." -ForegroundColor Cyan
    python scripts\preprocess.py --status
    Read-Host "按 Enter 键关闭"
    exit
}
elseif ($Reset) {
    Write-Host "[清理] 删除所有检查点..." -ForegroundColor Yellow
    if (Test-Path data\checkpoints) {
        Remove-Item -Recurse -Force data\checkpoints
    }
    Write-Host "检查点已清理，下次将从零开始" -ForegroundColor Green
    Read-Host "按 Enter 键关闭"
    exit
}
else {
    # 显示菜单
    Write-Host "请选择操作：" -ForegroundColor White
    Write-Host "  1. 全量处理（所有阶段，支持断点续传）" -ForegroundColor Green
    Write-Host "  2. 仅扫描（Phase 1：扫描PDF元数据）" -ForegroundColor Green
    Write-Host "  3. 仅解析（Phase 2：解析PDF内容）" -ForegroundColor Green
    Write-Host "  4. 仅向量化（Phase 3：构建向量索引）" -ForegroundColor Green
    Write-Host "  5. 查看状态" -ForegroundColor Green
    Write-Host "  6. 清理检查点（重新开始）" -ForegroundColor Red
    Write-Host ""
    $choice = Read-Host "请输入选项 (1-6)"
    Write-Host ""

    switch ($choice) {
        "1" {
            Write-Host "[全量处理] 开始执行所有阶段..." -ForegroundColor Cyan
            python scripts\preprocess.py --all --resume --dashboard
        }
        "2" {
            Write-Host "[扫描] 开始扫描PDF元数据..." -ForegroundColor Cyan
            python scripts\preprocess.py --phase 1
        }
        "3" {
            Write-Host "[解析] 开始解析PDF内容..." -ForegroundColor Cyan
            python scripts\preprocess.py --phase 2 --resume
        }
        "4" {
            Write-Host "[向量化] 开始构建向量索引..." -ForegroundColor Cyan
            python scripts\preprocess.py --phase 3 --resume
        }
        "5" {
            Write-Host "[状态] 查看当前处理状态..." -ForegroundColor Cyan
            python scripts\preprocess.py --status
            Read-Host "按 Enter 键关闭"
            exit
        }
        "6" {
            Write-Host "[清理] 删除所有检查点..." -ForegroundColor Yellow
            if (Test-Path data\checkpoints) {
                Remove-Item -Recurse -Force data\checkpoints
            }
            Write-Host "检查点已清理，下次将从零开始" -ForegroundColor Green
            Read-Host "按 Enter 键关闭"
            exit
        }
        default {
            Write-Host "无效选项" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "处理完成" -ForegroundColor Green
Read-Host "按 Enter 键关闭窗口"
