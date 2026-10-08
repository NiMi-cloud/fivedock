@echo off
rem Baut die Seite und startet sie lokal auf http://127.0.0.1:4173/ (nur auf diesem Rechner erreichbar).
rem Zum Beenden dieses Fenster schliessen.
cd /d "%~dp0"
set ALLOW_INCOMPLETE_LEGAL=1
echo Baue die Seite, das dauert einen Moment ...
call corepack pnpm@10.34.6 --filter @toolkit/web build
if errorlevel 1 (
  echo.
  echo Beim Bauen ist ein Fehler aufgetreten.
  pause
  exit /b 1
)
start "" http://127.0.0.1:4173/
echo.
echo Die Seite laeuft auf http://127.0.0.1:4173/ - zum Beenden dieses Fenster schliessen.
node spikes\08-deploy\serve-dist.ts 4173
pause
