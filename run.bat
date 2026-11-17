
@echo off
title STRANGE Launcher

echo =====================================
echo       S.T.R.A.N.G.E Launcher
echo =====================================
echo.

:: Terminal 1 - Backend server
start "STRANGE Backend" cmd /k "cd /d "%~dp0backend\src" && node server.js"

:: Terminal 2 - Backend terminal
start "STRANGE Terminal" cmd /k "cd /d "%~dp0backend" && npm run terminal"

:: Terminal 3 - Ollama model list
start "Ollama Models" cmd /k "ollama list"

echo.
echo All terminals launched.
exit
