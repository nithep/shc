@echo off
chcp 65001 > nul
title Hotel ECS Control Center
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Launcher.ps1"
pause
