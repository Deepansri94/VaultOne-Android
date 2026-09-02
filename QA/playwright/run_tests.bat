@echo off
cd /d "%~dp0"
echo Installing dependencies...
call npm install
call npx playwright install chromium
echo.
echo Running VaultOne Playwright tests...
call npx playwright test %*
echo.
echo Done. Open reports\index.html to view the HTML report.
