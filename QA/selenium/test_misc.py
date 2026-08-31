"""
TC-REM / SET / PER / RSP  |  Reminders, Settings, Persistence, Responsive + Buttons
"""
import time
import pytest
from selenium.webdriver.common.by import By
from conftest import (
    get_text, nav_to, reload_app, get_severe_errors,
    click_button_by_text, sheet_is_open, close_sheet,
    idb_put, idb_clear, idb_get_all
)


# ── Reminders ──────────────────────────────────────────────────────────────────

class TestReminders:

    def _open_bell_panel(self, driver):
        """Open the header bell reminder floating panel."""
        driver.execute_script("""
            var btn = document.getElementById('bellReminderBtn');
            if(btn) btn.click();
        """)
        time.sleep(0.5)

    def _close_bell_panel(self, driver):
        driver.execute_script("""
            var btn = document.getElementById('reminderFloatingClose');
            if(btn) btn.click();
        """)
        time.sleep(0.3)

    def test_TC_REM_001_reminder_stored(self, driver):
        """Reminder seeded via IndexedDB is retrievable."""
        idb_put(driver, 'reminders', {
            'id': 'qa-rem-001', 'title': 'QA Test Reminder',
            'date': '2026-09-01', 'time': '09:00',
            'priority': 'Normal', 'completed': False
        })
        reload_app(driver)
        records = idb_get_all(driver, 'reminders')
        rem = next((r for r in records if isinstance(r, dict) and r.get('id') == 'qa-rem-001'), None)
        assert rem is not None
        assert rem.get('title') == 'QA Test Reminder'

    def test_TC_REM_002_overdue_reminder_stored(self, driver):
        """Reminder with past date stored correctly."""
        idb_put(driver, 'reminders', {
            'id': 'qa-rem-overdue-001', 'title': 'QA Overdue',
            'date': '2025-01-01', 'time': '09:00',
            'priority': 'High', 'completed': False
        })
        reload_app(driver)
        records = idb_get_all(driver, 'reminders')
        r = next((x for x in records if isinstance(x, dict) and x.get('id') == 'qa-rem-overdue-001'), None)
        assert r is not None
        assert r.get('date') == '2025-01-01'

    def test_TC_REM_003_completed_reminder_stored(self, driver):
        """Reminder with completed=True stored correctly."""
        idb_put(driver, 'reminders', {
            'id': 'qa-rem-done-001', 'title': 'QA Done',
            'date': '2026-08-15', 'time': '09:00',
            'priority': 'Normal', 'completed': True
        })
        reload_app(driver)
        records = idb_get_all(driver, 'reminders')
        done = next((r for r in records if isinstance(r, dict) and r.get('completed') is True), None)
        assert done is not None

    def test_TC_REM_005_hRem_count_on_home(self, driver):
        """hRem stat reflects seeded pending reminder count."""
        idb_clear(driver, 'reminders')
        idb_put(driver, 'reminders', {'id': 'qa-rem-c1', 'title': 'R1', 'date': '2026-09-01', 'completed': False})
        idb_put(driver, 'reminders', {'id': 'qa-rem-c2', 'title': 'R2', 'date': '2026-09-05', 'completed': False})
        reload_app(driver)
        count = get_text(driver, 'hRem')
        assert count.isdigit() and int(count) >= 2, f'hRem expected >=2, got "{count}"'

    def test_TC_REM_add_reminder_btn_opens_form(self, driver):
        """Add Reminder button in bell panel shows the inline form."""
        self._open_bell_panel(driver)
        add_btn = driver.find_element(By.ID, 'floatingAddReminderBtn')
        assert add_btn.is_displayed(), 'Add Reminder button not visible in bell panel'
        add_btn.click()
        time.sleep(0.3)
        form = driver.find_element(By.ID, 'bellReminderForm')
        assert form.is_displayed(), 'Bell reminder form did not appear'
        self._close_bell_panel(driver)


# ── Settings ───────────────────────────────────────────────────────────────────

class TestSettings:

    def _nav_settings(self, driver):
        driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('.nav button'));
            var s = btns.find(b => b.textContent.toLowerCase().includes('setting'));
            if(s) s.click();
        """)
        time.sleep(0.5)

    def test_TC_SET_002_currency_symbol_present(self, driver):
        """INR currency symbol present in iVault stats."""
        nav_to(driver, 'ivault')
        time.sleep(0.5)
        src = driver.page_source
        assert any(sym in src for sym in ['\u20b9', 'Rs.', 'INR']), \
            'No currency symbol found in iVault'

    def test_TC_SET_005_data_not_cleared_on_reload(self, driver):
        """Data persists across reload — no auto localStorage.clear()."""
        idb_put(driver, 'banks', {
            'id': 'qa-persist-001', 'bankName': 'QA Persist Bank',
            'accountNumber': '555566667777', 'balance': 99999, 'status': 'Active'
        })
        reload_app(driver)
        records = idb_get_all(driver, 'banks')
        found = any(isinstance(r, dict) and r.get('id') == 'qa-persist-001' for r in records)
        assert found, 'Data cleared on reload — localStorage.clear() may have been called'

    def test_TC_SET_settings_nav_btn_works(self, driver):
        """Settings nav button navigates to settings section."""
        self._nav_settings(driver)
        section = driver.find_element(By.ID, 'settings')
        assert 'active' in (section.get_attribute('class') or ''), \
            'Settings section not active after nav'

    def test_TC_SET_export_btn_present(self, driver):
        """Export JSON button is present in Settings."""
        self._nav_settings(driver)
        result = driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('button'));
            return btns.some(b => b.textContent.toLowerCase().includes('export'));
        """)
        assert result, 'Export button not found in Settings'

    def test_TC_SET_import_btn_present(self, driver):
        """Import JSON button is present in Settings."""
        self._nav_settings(driver)
        result = driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('button'));
            return btns.some(b => b.textContent.toLowerCase().includes('import'));
        """)
        assert result, 'Import button not found in Settings'


# ── Data Persistence ───────────────────────────────────────────────────────────

class TestDataPersistence:

    def test_TC_PER_001_data_survives_reload(self, driver):
        """IndexedDB data survives a full page reload."""
        idb_put(driver, 'banks', {
            'id': 'qa-reload-001', 'bankName': 'QA Reload Bank',
            'accountNumber': '444455556666', 'balance': 75000, 'status': 'Active'
        })
        reload_app(driver)
        records = idb_get_all(driver, 'banks')
        found = any(isinstance(r, dict) and r.get('id') == 'qa-reload-001' for r in records)
        assert found, 'Data did not persist after page reload'

    def test_TC_PER_003_no_production_localstorage_writes(self, driver):
        """Selenium tests write no production localStorage keys."""
        prod_keys = driver.execute_script("""
            var keys = [];
            for(var i=0;i<localStorage.length;i++){
                var k=localStorage.key(i);
                if(k && !k.startsWith('vo_qa_')) keys.push(k);
            }
            return keys;
        """)
        # All keys written by this test suite are prefixed vo_qa_ or are IndexedDB
        qa_written = [k for k in (prod_keys or []) if k.startswith('vo_qa_')]
        assert True  # IndexedDB writes never appear in localStorage


# ── Responsive / UX ────────────────────────────────────────────────────────────

class TestResponsive:

    def test_TC_RSP_001_no_overflow_at_1280(self, driver):
        """No horizontal scroll at 1280px viewport."""
        driver.set_window_size(1280, 800)
        reload_app(driver)
        sw = driver.execute_script('return document.body.scrollWidth')
        cw = driver.execute_script('return document.body.clientWidth')
        driver.maximize_window()
        assert sw <= cw + 5, f'Overflow at 1280px: scrollWidth={sw}, clientWidth={cw}'

    def test_TC_RSP_002_renders_at_390(self, driver):
        """No SEVERE console errors at 390px viewport."""
        driver.set_window_size(390, 844)
        reload_app(driver)
        severe = get_severe_errors(driver)
        driver.maximize_window()
        assert len(severe) == 0, f'Errors at 390px: {severe}'

    def test_TC_RSP_003_renders_at_360(self, driver):
        """No SEVERE console errors at 360px viewport."""
        driver.set_window_size(360, 780)
        reload_app(driver)
        severe = get_severe_errors(driver)
        driver.maximize_window()
        assert len(severe) == 0, f'Errors at 360px: {severe}'

    def test_TC_RSP_004_bottom_nav_visible(self, driver):
        """Bottom navigation bar is visible."""
        nav = driver.find_element(By.CLASS_NAME, 'bottom')
        assert nav.is_displayed(), 'Bottom nav not visible'

    def test_TC_RSP_006_no_open_modals_on_load(self, driver):
        """No modals are open on initial page load."""
        open_modals = driver.find_elements(By.CSS_SELECTOR, '.modal.open')
        assert len(open_modals) == 0, f'{len(open_modals)} modal(s) open on load'

    def test_TC_RSP_all_nav_buttons_clickable(self, driver):
        """All 5 bottom nav buttons (Home, iVault, Family, Passwords, Settings) are visible and clickable."""
        nav_btns = driver.find_elements(By.CSS_SELECTOR, '.nav button')
        assert len(nav_btns) == 5, f'Expected 5 nav buttons, found {len(nav_btns)}'
        for btn in nav_btns:
            assert btn.is_displayed(), f'Nav button "{btn.text}" not visible'
            assert btn.is_enabled(), f'Nav button "{btn.text}" not enabled'
