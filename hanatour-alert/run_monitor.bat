@echo off
rem Run by Windows Task Scheduler: move to this folder and run monitor.py
cd /d "%~dp0"
python monitor.py >> monitor_console.log 2>&1
