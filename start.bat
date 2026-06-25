@echo off
chcp 65001 >nul
echo ===========================================
echo    讲义生成器 - 一键启动
echo ===========================================
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

:: 关闭旧进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8082') do taskkill /F /PID %%a >nul 2>&1

:: 启动并打开浏览器
echo 启动服务...
start /b node serve.js
timeout /t 2 /nobreak >nul
start http://localhost:8082

echo.
echo 服务已启动: http://localhost:8082
echo 按 Ctrl+C 关闭
echo.

:: 保持运行
node -e "require('readline').createInterface(process.stdin).on('close',()=>process.exit(0));setInterval(()=>{},1000)"
