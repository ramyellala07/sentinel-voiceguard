@echo off
title VoiceGuard AI Launcher
echo ===================================================
echo           Starting VoiceGuard AI System
echo ===================================================
echo.

cd /d "%~dp0"

echo [1/2] Starting Detection & Anti-Spoof Backend (Port 5000)...
start "VoiceGuard Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn main:app --port 5000 --reload"

echo [2/2] Starting React + Vite Frontend (Port 5173)...
echo.
echo Website will open automatically at http://localhost:5173
echo Press Ctrl+C in this terminal to stop frontend.
echo.

npm run dev -- --open
