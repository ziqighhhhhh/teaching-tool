@echo off
REM 启动教材预处理服务（调用 PowerShell 脚本）
powershell -ExecutionPolicy Bypass -File "%~dp0start_preprocess.ps1"
