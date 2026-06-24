@echo off
echo.
echo ========================================
echo   Teaching Tool - One Click Start
echo ========================================
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js installed
node -v

:: Check node_modules
if not exist "node_modules" (
    echo.
    echo [1/3] Installing dependencies...
    npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

:: Check .env file
if not exist ".env" (
    echo.
    echo [WARNING] .env not found, creating default config...
    echo LLM_API_KEY=your_api_key_here > .env
    echo LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 >> .env
    echo LLM_MODELS=qwen3.7-max-2026-05-17 >> .env
    echo PORT=8082 >> .env
    echo [OK] Default .env created. Please edit it with your API key.
)

:: Start server
echo.
echo [2/3] Starting server...
start /b node server.js

:: Wait for server startup
echo [3/3] Waiting for server startup...
timeout /t 3 /nobreak >nul

:: Open browser
echo [OK] Opening browser...
start http://localhost:8082

echo.
echo ========================================
echo   Server started!
echo   URL: http://localhost:8082
.echo   Press Ctrl+C to stop server
echo ========================================
echo.

pause
