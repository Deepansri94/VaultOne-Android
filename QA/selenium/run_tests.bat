@echo off
echo ============================================
echo  VaultOne Selenium Test Suite
echo ============================================

cd /d "%~dp0"

if not exist reports mkdir reports

echo Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo Running all tests...
pytest --html=reports/report.html --self-contained-html -v

echo.
echo Done. Report saved to reports\report.html
pause
