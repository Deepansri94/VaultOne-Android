@echo off
echo ============================================
echo  VaultOne Automated Test Suite
echo ============================================
cd /d "%~dp0"
python -m pytest -v --html=reports/VaultOne_TestReport.html --self-contained-html
echo.
echo Report saved to: reports\VaultOne_TestReport.html
echo Opening report...
start reports\VaultOne_TestReport.html
pause
