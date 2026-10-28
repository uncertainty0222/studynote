@echo off
rem One-time setup: Python venv + PyTorch (CUDA 12.8) + VoxCPM
cd /d "%~dp0"
py -3.12 -m venv .venv || goto :err
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128 || goto :err
python -m pip install voxcpm || goto :err
python -c "import torch; print('CUDA GPU:', torch.cuda.is_available())"
echo.
echo Setup done. Next: double-click test.bat
pause
exit /b 0
:err
echo.
echo Setup failed. Copy the error message above and send it to Claude.
pause
exit /b 1
