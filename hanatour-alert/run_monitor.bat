@echo off
rem Run by Windows Task Scheduler: move to this folder and run monitor.py
rem Force UTF-8 output so Korean text does not crash when redirected to a file
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python monitor.py >> monitor_console.log 2>&1
