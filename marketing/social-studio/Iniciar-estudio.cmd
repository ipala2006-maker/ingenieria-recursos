@echo off
setlocal
cd /d "%~dp0"
node --env-file-if-exists=.env server.mjs --open
if errorlevel 1 pause
