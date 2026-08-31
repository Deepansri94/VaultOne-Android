VaultOne v1.5 Selenium test runner

Files:
- vaultone_selenium_test.py
- requirements_vaultone_test.txt

Put these files beside VaultOne_v1.5_Stable_Fixed.html, then run:

  python -m pip install -r requirements_vaultone_test.txt
  python vaultone_selenium_test.py --html VaultOne_v1.5_Stable_Fixed.html --headless

For Microsoft Edge:

  python vaultone_selenium_test.py --html VaultOne_v1.5_Stable_Fixed.html --browser edge --headless

To watch the test interact with the application, omit --headless.
Failure screenshots and HTML snapshots are written to vaultone_test_artifacts.
Use test data only: the script deletes VaultOneDB and localStorage at startup.
