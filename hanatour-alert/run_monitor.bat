@echo off
rem 작업 스케줄러가 실행하는 파일. 이 폴더로 이동한 뒤 monitor.py 를 실행한다.
cd /d "%~dp0"
python monitor.py >> monitor_console.log 2>&1
