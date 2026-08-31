#!/usr/bin/env python3
"""Selenium end-to-end smoke/regression tests for VaultOne v1.5.

Usage:
  pip install -r requirements_vaultone_test.txt
  python vaultone_selenium_test.py --html VaultOne_v1.5_Stable_Fixed.html --headless

The script starts a temporary local HTTP server for the HTML file, opens Chrome or
Edge, exercises the repaired workflows, captures screenshots on failure, and
returns a non-zero exit code when a test fails.
"""
from __future__ import annotations

import argparse
import contextlib
import json
import os
import socket
import subprocess
import sys
import time
import unittest
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


CONFIG = None


def free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_server(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError("The local VaultOne test server did not start.")


class VaultOneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.html = Path(CONFIG.html).expanduser().resolve()
        if not cls.html.is_file():
            raise FileNotFoundError(f"VaultOne HTML not found: {cls.html}")

        cls.port = free_port()
        cls.server = subprocess.Popen(
            [sys.executable, "-m", "http.server", str(cls.port),
             "--bind", "127.0.0.1", "--directory", str(cls.html.parent)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_for_server(cls.port)

        if CONFIG.browser == "edge":
            options = webdriver.EdgeOptions()
            if CONFIG.headless:
                options.add_argument("--headless=new")
            options.add_argument("--window-size=1440,1100")
            options.add_argument("--disable-notifications")
            options.add_argument("--no-sandbox")
            cls.driver = webdriver.Edge(options=options)
        else:
            options = webdriver.ChromeOptions()
            if CONFIG.headless:
                options.add_argument("--headless=new")
            options.add_argument("--window-size=1440,1100")
            options.add_argument("--disable-notifications")
            options.add_argument("--no-sandbox")
            cls.driver = webdriver.Chrome(options=options)

        cls.wait = WebDriverWait(cls.driver, CONFIG.timeout)
        cls.url = f"http://127.0.0.1:{cls.port}/{cls.html.name}"
        cls.driver.get(cls.url)
        cls.wait.until(EC.visibility_of_element_located((By.ID, "home")))
        cls._clear_application_data()

    @classmethod
    def tearDownClass(cls) -> None:
        with contextlib.suppress(Exception):
            cls.driver.quit()
        with contextlib.suppress(Exception):
            cls.server.terminate()
            cls.server.wait(timeout=5)

    @classmethod
    def _clear_application_data(cls) -> None:
        cls.driver.execute_async_script("""
            const done = arguments[arguments.length - 1];
            try {
              localStorage.clear();
              const req = indexedDB.deleteDatabase('VaultOneDB');
              req.onsuccess = req.onerror = req.onblocked = () => done(true);
            } catch (e) { done(false); }
        """)
        cls.driver.refresh()
        cls.wait.until(EC.visibility_of_element_located((By.ID, "home")))

    def setUp(self) -> None:
        self.console_errors = []

    def tearDown(self) -> None:
        if self._outcome.success is False:
            Path(CONFIG.artifacts).mkdir(parents=True, exist_ok=True)
            name = self.id().split(".")[-1]
            self.driver.save_screenshot(str(Path(CONFIG.artifacts) / f"{name}.png"))
            (Path(CONFIG.artifacts) / f"{name}.html").write_text(
                self.driver.page_source, encoding="utf-8"
            )

    def click(self, by: By, value: str):
        element = self.wait.until(EC.element_to_be_clickable((by, value)))
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", element)
        element.click()
        return element

    def visible(self, by: By, value: str):
        return self.wait.until(EC.visibility_of_element_located((by, value)))

    def fill(self, name: str, value: str):
        element = self.visible(By.NAME, name)
        element.clear()
        element.send_keys(value)
        return element

    def select_text(self, name: str, text: str):
        Select(self.visible(By.NAME, name)).select_by_visible_text(text)

    def go(self, view: str) -> None:
        self.click(By.CSS_SELECTOR, f'.nav [data-go="{view}"]')
        self.wait.until(lambda d: "active" in d.find_element(By.ID, view).get_attribute("class"))

    def finance_tab(self, tab: str) -> None:
        self.go("ivault")
        self.click(By.CSS_SELECTOR, f'[data-sub="{tab}"]')
        self.wait.until(lambda d: d.find_element(By.ID, tab).value_of_css_property("display") != "none")

    def close_modal(self) -> None:
        if "open" in self.driver.find_element(By.ID, "modal").get_attribute("class"):
            self.click(By.ID, "modalClose")

    def accept_alert(self) -> str:
        alert = self.wait.until(EC.alert_is_present())
        text = alert.text
        alert.accept()
        return text

    def save_account(self, institution: str, account_type: str,
                     account_number: str, opening_balance: str = "0") -> None:
        self.finance_tab("banks")
        self.click(By.ID, "addBankAccountBtn")
        self.select_text("institutionType", "Post Office" if account_type in {"PPF", "SSA"} else "Bank")
        self.fill("name", institution)
        self.select_text("accountType", account_type)
        Select(self.visible(By.NAME, "primaryHolderPersonId")).select_by_index(1)
        self.fill("accountNumber", account_number)
        self.fill("initialBalance", opening_balance)
        self.click(By.CSS_SELECTOR, "#modalBody form button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))
        self.assertIn(institution, self.driver.find_element(By.ID, "banks").text)

    def choose_investment(self, investment_type: str) -> None:
        self.finance_tab("investments")
        self.click(By.ID, "addInvestmentBtn")
        self.click(By.CSS_SELECTOR, f'[data-investment-choice="{investment_type}"]')
        self.visible(By.ID, "investmentDynamicForm")

    def test_01_navigation_and_initial_load(self):
        for view in ["ivault", "family", "passwords", "reminders", "settings", "home"]:
            self.go(view)
            self.assertIn("active", self.driver.find_element(By.ID, view).get_attribute("class"))
        self.assertEqual([], self.driver.find_elements(By.CSS_SELECTOR, "[data-pedit]"))

    def test_02_profile_pin_and_password_unlock(self):
        self.go("settings")
        profile = self.driver.find_element(By.ID, "profileName")
        profile.clear(); profile.send_keys("Automation User")
        self.click(By.CSS_SELECTOR, "#profileForm button[type='submit']")

        pin = self.driver.find_element(By.ID, "pinInput")
        pin.send_keys("1234")
        Select(self.driver.find_element(By.ID, "autoLock")).select_by_value("0")
        self.click(By.ID, "saveSecurity")

        self.go("passwords")
        self.click(By.ID, "unlockBtn")
        self.fill("pin", "1234")
        self.click(By.CSS_SELECTOR, "#modalBody form button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        self.click(By.ID, "addPassBtn")
        self.fill("name", "Example Login")
        self.fill("username", "automation@example.test")
        self.fill("password", "StrongPass123!")
        self.fill("url", "https://example.test")
        self.click(By.CSS_SELECTOR, "#modalBody form button.btn.primary")
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "passList"), "Example Login"))
        self.assertEqual(1, len(self.driver.find_elements(By.CSS_SELECTOR, "[data-password-edit]")))

    def test_03_family_household_person_and_namespaced_edit(self):
        self.go("family")
        self.click(By.ID, "addHouseBtn")
        self.click(By.ID, "showAddHouseForm")
        self.fill("name", "Automation Household")
        self.fill("description", "Selenium test household")
        self.fill("address", "1 Test Street, Test City")
        self.click(By.ID, "saveHouseBtn")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        self.click(By.ID, "addPersonBtn")
        self.click(By.ID, "showAddMemberForm")
        self.fill("name", "Automation Member")
        self.fill("relation", "Member")
        Select(self.visible(By.NAME, "householdId")).select_by_visible_text("Automation Household")
        self.fill("dob", "2000-01-01")
        self.select_text("status", "Active")
        self.click(By.CSS_SELECTOR, "#personForm button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        self.click(By.ID, "addPersonBtn")
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "modalBody"), "Automation Member"))
        self.assertEqual(1, len(self.driver.find_elements(By.CSS_SELECTOR, "[data-person-edit]")))
        self.assertEqual([], self.driver.find_elements(By.CSS_SELECTOR, "#modalBody [data-password-edit]"))
        self.close_modal()

    def test_04_accounts_and_repaired_investment_contracts(self):
        self.save_account("Automation Savings", "Savings", "100001", "100000")
        self.save_account("Automation FD", "FD", "200001")
        self.save_account("Automation RD", "RD", "300001")
        self.save_account("Automation PPF", "PPF", "400001")
        self.save_account("Automation SSA", "SSA", "500001")
        self.save_account("Automation NPS", "NPS", "600001")
        self.save_account("Automation Demat", "Demat", "700001")

        # FD: bank name is now derived from the selected central FD account.
        self.choose_investment("fd")
        Select(self.visible(By.NAME, "accountId")).select_by_visible_text("Automation FD • 200001")
        self.fill("name", "Automation Fixed Deposit")
        self.fill("principal", "50000")
        self.fill("interestRate", "7")
        self.fill("tenureMonths", "12")
        Select(self.visible(By.NAME, "paidFromAccountId")).select_by_visible_text("Automation Savings • Savings • 100001")
        self.click(By.CSS_SELECTOR, "#investmentDynamicForm button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))
        self.assertIn("Automation Fixed Deposit", self.driver.find_element(By.ID, "investments").text)

        # RD: same central-account contract repair.
        self.choose_investment("rd")
        Select(self.visible(By.NAME, "accountId")).select_by_visible_text("Automation RD • 300001")
        self.fill("name", "Automation Recurring Deposit")
        self.fill("monthlyContribution", "2000")
        self.fill("interestRate", "6.5")
        self.fill("tenureMonths", "12")
        Select(self.visible(By.NAME, "paidFromAccountId")).select_by_visible_text("Automation Savings • Savings • 100001")
        self.click(By.CSS_SELECTOR, "#investmentDynamicForm button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        # PPF/SSA/NPS now expose their required central account selector.
        for kind, account_text, provider in [
            ("ppf", "Automation PPF • 400001", "Automation Post Office"),
            ("ssa", "Automation SSA • 500001", "Automation Post Office"),
            ("nps", "Automation NPS • 600001", "Automation Pension Provider"),
        ]:
            self.choose_investment(kind)
            Select(self.visible(By.NAME, "accountId")).select_by_visible_text(account_text)
            if kind in {"ppf", "ssa"}:
                self.fill("bankName", provider)
                self.fill("name", f"Automation {kind.upper()}")
                self.fill("asOfBalance", "10000")
            else:
                self.fill("provider", provider)
                self.fill("name", "Automation NPS")
                self.fill("monthlyContribution", "1000")
                self.fill("currentValue", "12000")
            self.click(By.CSS_SELECTOR, "#investmentDynamicForm button.btn.primary")
            self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        # Demat form and save logic must agree on fundingAccountId.
        self.choose_investment("demat")
        self.fill("stockName", "TESTCO")
        self.select_text("sector", "IT & Technology")
        self.fill("lotQty", "10")
        self.fill("lotPurchasePrice", "100")
        self.fill("currentPrice", "120")
        Select(self.visible(By.NAME, "accountId")).select_by_visible_text("Automation Demat • 700001")
        Select(self.visible(By.NAME, "fundingAccountId")).select_by_visible_text("Automation Savings • Savings • 100001")
        self.click(By.CSS_SELECTOR, "#investmentDynamicForm button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))
        self.assertIn("TESTCO", self.driver.find_element(By.ID, "investments").text)

    def test_05_document_preview_close_and_search_fields(self):
        self.go("family")
        self.click(By.ID, "addDocBtn")
        self.fill("title", "Automation Identity Document")
        self.select_text("type", "Other")
        self.select_text("ownerType", "Person")
        Select(self.visible(By.NAME, "personId")).select_by_visible_text("Automation Member")
        self.fill("documentNumber", "TEST-12345678")
        fixture = Path(CONFIG.artifacts).resolve() / "vaultone_test_document.txt"
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text("VaultOne Selenium document fixture", encoding="utf-8")
        self.driver.find_element(By.ID, "docFile").send_keys(str(fixture))
        self.click(By.CSS_SELECTOR, "#docForm button.btn.primary")
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "familyList"), "Automation Identity Document"))

        self.click(By.CSS_SELECTOR, "[data-preview]")
        self.visible(By.CSS_SELECTOR, '[data-action="preview-close"]')
        self.click(By.CSS_SELECTOR, '[data-action="preview-close"]')
        self.wait.until(lambda d: "open" not in d.find_element(By.ID, "modal").get_attribute("class"))

        self.click(By.ID, "globalSearchBtn")
        prompt = self.wait.until(EC.alert_is_present())
        prompt.send_keys("Automation Identity Document")
        prompt.accept()
        self.wait.until(EC.text_to_be_present_in_element((By.ID, "modalBody"), "Automation Identity Document"))
        self.close_modal()

    def test_06_backup_schema_self_test(self):
        self.go("settings")
        self.click(By.ID, "selfTestBtn")
        result = self.wait.until(lambda d: d.find_element(By.ID, "testResult").text)
        self.assertIn("PASS  Backup schema", result, result)
        self.assertNotIn("FAIL", result, result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Selenium tests against VaultOne v1.5")
    parser.add_argument("--html", default="VaultOne_v1.5_Stable_Fixed.html",
                        help="Path to the VaultOne HTML file")
    parser.add_argument("--browser", choices=["chrome", "edge"], default="chrome")
    parser.add_argument("--headless", action="store_true", help="Run without a visible browser window")
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--artifacts", default="vaultone_test_artifacts",
                        help="Directory for failure screenshots and page source")
    args, unittest_args = parser.parse_known_args()
    CONFIG = args
    unittest.main(argv=[sys.argv[0], *unittest_args], verbosity=2)
