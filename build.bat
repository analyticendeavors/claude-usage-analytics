@echo off
echo ========================================
echo  Claude Usage Analytics - Build Script
echo ========================================
echo.

cd /d "%~dp0"

echo Removing old .vsix files...
del /q *.vsix 2>nul

echo.
echo Installing dependencies...
call npm install

echo.
echo Compiling TypeScript...
call npm run compile

echo.
echo Packaging extension...
call npx vsce package

echo.
echo ========================================
echo  Build complete!
echo ========================================
echo.
dir /b *.vsix 2>nul
echo.
pause
