@echo off
rem Make sentence #1 only (first run downloads the model, takes a while)
cd /d "%~dp0"
call .venv\Scripts\activate.bat || goto :err
python make_audio.py --test %* || goto :err
start "" "%~dp0audio"
pause
exit /b 0
:err
echo.
echo Failed. Copy the error message above and send it to Claude.
pause
exit /b 1
