@echo off
setlocal EnableDelayedExpansion
title Nitron Bootstrapper

:: ─── Color helpers ───────────────────────────────────────────────────────
set "ESC="
for /f "delims=" %%A in ('echo prompt $E ^| cmd') do set "ESC=%%A"

echo %ESC%[1;36m
echo  ███╗   ██╗██╗████████╗██████╗  ██████╗ ███╗   ██╗
echo  ████╗  ██║██║╚══██╔══╝██╔══██╗██╔═══██╗████╗  ██║
echo  ██╔██╗ ██║██║   ██║   ██████╔╝██║   ██║██╔██╗ ██║
echo  ██║╚██╗██║██║   ██║   ██╔══██╗██║   ██║██║╚██╗██║
echo  ██║ ╚████║██║   ██║   ██║  ██║╚██████╔╝██║ ╚████║
echo  ╚═╝  ╚═══╝╚═╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
echo %ESC%[0m
echo  %ESC%[90mFast. Clean. Yours.%ESC%[0m
echo.

:: ─── Locate project root (same folder as this .bat) ──────────────────────
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "PKG=%ROOT%\package.json"
set "NMODS=%ROOT%\node_modules"
set "ELECTRON=%NMODS%\.bin\electron.cmd"

if not exist "%PKG%" (
  echo %ESC%[31m [ERROR]%ESC%[0m package.json not found in:
  echo         %ROOT%
  echo         Make sure Bootstrapper.bat is in the project root.
  pause & exit /b 1
)

:: ─── Check Node.js ────────────────────────────────────────────────────────
echo %ESC%[33m [1/3]%ESC%[0m Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo %ESC%[31m [ERROR]%ESC%[0m Node.js not found. Download from https://nodejs.org
  pause & exit /b 1
)
for /f "tokens=*" %%V in ('node -v 2^>nul') do set "NODEVER=%%V"
echo %ESC%[32m   OK%ESC%[0m   Node.js %NODEVER%

:: ─── Install / verify node_modules ───────────────────────────────────────
echo %ESC%[33m [2/3]%ESC%[0m Checking dependencies...
if not exist "%ELECTRON%" (
  echo %ESC%[90m        Running npm install...%ESC%[0m
  cd /d "%ROOT%"
  call npm install --prefer-offline --no-audit --no-fund >nul 2>&1
  if errorlevel 1 (
    echo %ESC%[31m [ERROR]%ESC%[0m npm install failed. Check your internet connection.
    pause & exit /b 1
  )
  echo %ESC%[32m   OK%ESC%[0m   Dependencies installed.
) else (
  echo %ESC%[32m   OK%ESC%[0m   node_modules found.
)

:: ─── Launch Electron ──────────────────────────────────────────────────────
echo %ESC%[33m [3/3]%ESC%[0m Launching Nitron...
echo.
cd /d "%ROOT%"

:: Pass extra Chromium flags for better performance on Windows
set "ELECTRON_EXTRA_LAUNCH_ARGS=--disable-renderer-backgrounding --enable-gpu-rasterization --enable-zero-copy"

:: Use start /B to keep the terminal open for logs (remove /B to detach)
start "" "%ELECTRON%" .

:: Optionally close this bootstrapper window after launch (uncomment to enable)
:: timeout /t 2 >nul
:: exit /b 0

echo %ESC%[32m   Nitron is starting...%ESC%[0m
echo %ESC%[90m   You can close this window.%ESC%[0m
