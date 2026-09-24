# VoiceGuard AI Launcher for PowerShell
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "          Starting VoiceGuard AI System            " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start Backend in separate window
Write-Host "`n[1/2] Starting Backend (FastAPI on Port 5000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; & '.\.venv\Scripts\python.exe' -m uvicorn main:app --port 5000 --reload"

# 2. Start Frontend
Write-Host "[2/2] Starting Frontend (Vite on Port 5173)...`n" -ForegroundColor Green
Write-Host "Opening http://localhost:5173 ..." -ForegroundColor Cyan
cd $Root
npm run dev -- --open
