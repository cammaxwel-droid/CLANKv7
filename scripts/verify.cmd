@echo off
setlocal
rem No installation, PATH change, or PowerShell execution-policy change.
if defined CLANK_PYTHON goto configured
py -3 --version >nul 2>nul
if not errorlevel 1 goto launcher
rem Reuse Blender's real CPython if the Windows Python launcher has none.
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender *") do for /d %%V in ("%%~fD\*") do if exist "%%~fV\python\bin\python.exe" set "CLANK_PYTHON=%%~fV\python\bin\python.exe"
if defined CLANK_PYTHON goto configured
echo Python 3 is required. Set CLANK_PYTHON to an existing python.exe, then retry. 1>&2
exit /b 1

:configured
"%CLANK_PYTHON%" -I -B "%~dp0verify.py" %*
exit /b %errorlevel%

:launcher
py -3 -I -B "%~dp0verify.py" %*
exit /b %errorlevel%
