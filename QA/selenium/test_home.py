"""
TC-HOM-001 to TC-HOM-005  |  Home Module + Button Validation
"""
import time
import pytest
from selenium.webdriver.common.by import By
from conftest import (
    get_text, nav_to, reload_app, wait_for, wait_clickable,
    click_button_by_text, sheet_is_open, close_sheet, get_severe_errors
)


class TestHome:

    def test_TC_HOM_001_dashboard_loads_no_errors(self, driver):
        """Dashboard loads — all 4 stat cards present, zero console errors."""
        for el_id in ['hNet', 'hDocs', 'hPass', 'hRem']:
            assert driver.find_element(By.ID, el_id), f'#{el_id} missing'
        assert len(get_severe_errors(driver)) == 0

    def test_TC_HOM_002_hNet_matches_ivault_networth(self, driver):
        """hNet on Home equals netWorth shown in iVault (numeric comparison)."""
        def _parse_amount(text):
            """Strip currency symbol/commas and return float."""
            import re
            return float(re.sub(r'[^\d.]', '', text) or '0')

        home_net = _parse_amount(get_text(driver, 'hNet'))
        nav_to(driver, 'ivault')
        ivault_net = _parse_amount(get_text(driver, 'netWorth'))
        assert home_net == ivault_net, \
            f'hNet ({home_net}) does not match netWorth ({ivault_net})'

    def test_TC_HOM_003_btn_open_ivault(self, driver):
        """'Open iVault' button navigates to iVault section."""
        btn = wait_clickable(driver, By.XPATH,
            "//button[@data-go='ivault' or contains(text(),'iVault')]")
        btn.click()
        time.sleep(0.5)
        assert 'active' in driver.find_element(By.ID, 'ivault').get_attribute('class')

    def test_TC_HOM_003_btn_familyvault(self, driver):
        """'FamilyVault' button navigates to family section."""
        btn = wait_clickable(driver, By.XPATH,
            "//button[@data-go='family' or contains(text(),'FamilyVault')]")
        btn.click()
        time.sleep(0.5)
        assert 'active' in driver.find_element(By.ID, 'family').get_attribute('class')

    def test_TC_HOM_003_btn_passwordvault(self, driver):
        """'PasswordVault' button navigates to passwords section."""
        btn = wait_clickable(driver, By.XPATH,
            "//button[@data-go='passwords' or contains(text(),'PasswordVault')]")
        btn.click()
        time.sleep(0.5)
        assert 'active' in driver.find_element(By.ID, 'passwords').get_attribute('class')

    def test_TC_HOM_003_nav_has_5_tabs(self, driver):
        """Bottom nav has exactly 5 tabs: Home, iVault, Family, Passwords, Settings.
        Reminders is no longer a nav tab — it moved to the header bell icon."""
        nav_btns = driver.find_elements(By.CSS_SELECTOR, '.nav button')
        assert len(nav_btns) == 5, f'Expected 5 nav buttons, found {len(nav_btns)}'
        labels = [b.text.strip() for b in nav_btns]
        for expected in ['Home', 'iVault', 'Family', 'Passwords', 'Settings']:
            assert any(expected.lower() in lbl.lower() for lbl in labels), \
                f'Nav tab "{expected}" not found in {labels}'

    def test_TC_HOM_003_bell_reminder_btn_present(self, driver):
        """Bell reminder button is present in the header (replaces Reminders nav tab)."""
        bell = driver.find_element(By.ID, 'bellReminderBtn')
        assert bell.is_displayed(), 'Bell reminder button not visible in header'

    def test_TC_HOM_003_bell_opens_floating_panel(self, driver):
        """Clicking the bell opens the reminder floating panel."""
        bell = wait_clickable(driver, By.ID, 'bellReminderBtn')
        bell.click()
        time.sleep(0.4)
        panel = driver.find_element(By.ID, 'reminderFloatingPanel')
        assert 'open' in (panel.get_attribute('class') or ''), \
            'Reminder floating panel did not open'
        driver.find_element(By.ID, 'reminderFloatingClose').click()

    def test_TC_HOM_004_recent_activity_section_present(self, driver):
        """activityList element is present on dashboard."""
        assert driver.find_element(By.ID, 'activityList')

    def test_TC_HOM_005_upcoming_reminders_section_present(self, driver):
        """homeReminders element is present on dashboard."""
        assert driver.find_element(By.ID, 'homeReminders')
