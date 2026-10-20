@echo off
rem Sobe painel (8096) e scout com o .env carregado
cd /d "%~dp0"
set PYTHONUTF8=1
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%~b"
start "uJob painel" /min cmd /c "cd apps\panel && pocketbase.exe serve --http=127.0.0.1:8096 > ..\..\.panel.log 2>&1"
start "uJob scout" /min cmd /c "cd services\scout && uv run python -m ujob_scout.scheduler > ..\..\.scout.log 2>&1"
start "uJob brain" /min cmd /c "cd services\brain && uv run python -m brain.worker > ..\..\.brain.log 2>&1"
timeout /t 3 >nul
start "" http://127.0.0.1:8096
