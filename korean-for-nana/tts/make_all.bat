@echo off
rem Make all 50 sentences. Existing files are skipped.
cd /d "%~dp0"
call .venv\Scripts\activate.bat || goto :err
python make_audio.py %* || goto :err
start "" "%~dp0audio"
pause
exit /b 0
:err
echo.
echo Failed. Copy the error message above and send it to Claude.
pause
exit /b 1
