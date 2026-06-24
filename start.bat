@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   智能教辅讲义生成器 - 一键启动
echo ========================================
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js 已安装
node -v

:: 检查 node_modules
if not exist "node_modules" (
    echo.
    echo [1/3] 正在安装依赖...
    npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [✓] 依赖安装完成
) else (
    echo [✓] 依赖已安装
)

:: 检查 .env 文件
if not exist ".env" (
    echo.
    echo [警告] 未找到 .env 文件，正在创建默认配置...
    echo LLM_API_KEY=your_api_key_here > .env
    echo LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 >> .env
    echo LLM_MODELS=qwen3.7-max-2026-05-17 >> .env
    echo PORT=8082 >> .env
    echo [✓] 默认 .env 已创建，请编辑填写你的 API 密钥
)

:: 启动服务器
echo.
echo [2/3] 正在启动服务器...
start /b node server.js

:: 等待服务器启动
echo [3/3] 等待服务器启动...
timeout /t 3 /nobreak >nul

:: 打开浏览器
echo [✓] 打开浏览器...
start http://localhost:8082

echo.
echo ========================================
echo   服务器已启动!
echo   访问地址: http://localhost:8082
echo   按 Ctrl+C 停止服务器
echo ========================================
echo.

pause
