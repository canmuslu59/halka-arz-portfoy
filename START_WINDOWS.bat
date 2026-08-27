@echo off
chcp 65001 > nul
title Halka Arz Portfoyum
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden Node.js 20 veya daha yenisini kurun.
  pause
  exit /b 1
)
start "" http://localhost:3000
node server.js
pause
