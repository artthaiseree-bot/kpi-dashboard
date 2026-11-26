@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"
title KPI Dashboard 2026
echo ==================================================
echo   KPI Dashboard 2026 - Excel Auto Sync
echo ==================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] ไม่พบ Node.js กรุณาติดตั้ง Node.js LTS ก่อน
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] กำลังติดตั้งแพ็กเกจที่จำเป็น...
  call npm install
  if errorlevel 1 (
    echo [ERROR] ติดตั้งแพ็กเกจไม่สำเร็จ
    pause
    exit /b 1
  )
)

echo [INFO] กำลังเปิด Dashboard ที่ http://localhost:3000
start "" "http://localhost:3000"
call npm start
pause
