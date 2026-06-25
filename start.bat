@echo off
echo.
echo ===========================================
echo    Teaching Handout Generator - Start
echo ===========================================
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not installed!
    echo Please install from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1" %%a in ('node -v') do echo [OK] Node.js %%a
echo.

:: Close old process to avoid port conflict
echo [1/3] Stopping old process...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8082') do taskkill /F /PID %%a >nul 2>&1
echo [OK] Port 8082 freed

:: Start proxy server
echo.
echo [2/3] Starting server...
start /b node serve.js
echo [OK] Server started

:: Wait for server ready
echo.
echo [3/3] Waiting for server...
timeout /t 2 /nobreak >nul

:: Open browser
echo [OK] Opening browser...
start http://localhost:8082

:: Show info
echo.
echo ===========================================
echo    Server running!
echo    URL: http://localhost:8082
echo ===========================================
echo.

:: Keep window open, press any key to close
echo Press any key to stop server...
pause >nul

:: Stop server
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8082') do taskkill /F /PID %%a >nul 2>&1
echo Server stopped
echo.
