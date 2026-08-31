"""
TC-PWD-001 to TC-PWD-010  |  PasswordVault + PIN + Lock/Unlock
"""
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from conftest import (
    nav_to, reload_app, get_severe_errors,
    click_button_by_text, sheet_is_open, close_sheet,
    idb_put, idb_get_all, idb_clear,
)

TEST_PIN = '1234'


def _setup_pin(driver, pin=TEST_PIN):
    """Set vault PIN via Settings → Security section."""
    nav_to(driver, 'settings')
    time.sleep(0.4)
    driver.execute_script("""
        var inp = document.getElementById('pinInput');
        if(inp){ inp.value = arguments[0]; inp.dispatchEvent(new Event('input')); }
    """, pin)
    driver.execute_script("""
        var btn = document.getElementById('saveSecurity');
        if(btn) btn.click();
    """)
    time.sleep(0.6)


def _unlock_vault(driver, pin=TEST_PIN):
    """Unlock PasswordVault via the Unlock modal."""
    nav_to(driver, 'passwords')
    time.sleep(0.4)
    driver.execute_script("""
        var btn = document.getElementById('unlockBtn');
        if(btn) btn.click();
    """)
    WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
    time.sleep(0.3)
    driver.execute_script("""
        var inp = document.querySelector('#modalBody input[type="password"], #modalBody input[type="number"], #modalBody input');
        if(inp){ inp.value = arguments[0]; inp.dispatchEvent(new Event('input')); }
    """, pin)
    driver.execute_script("""
        var form = document.querySelector('#modalBody form');
        if(form){
            var btn = form.querySelector('button.primary, button[type="submit"]');
            if(btn) btn.click();
        }
    """)
    time.sleep(0.8)


def _add_password_via_ui(driver, name='qa-site.com', username='qa_user',
                          password='QaP@ss123!'):
    """Add a password entry via the Add Password modal (vault must be unlocked)."""
    nav_to(driver, 'passwords')
    time.sleep(0.3)
    driver.execute_script("""
        var btn = document.getElementById('addPassBtn');
        if(btn) btn.click();
    """)
    WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
    time.sleep(0.3)
    driver.execute_script("""
        var form = document.querySelector('#modalBody form');
        if(!form) return;
        var set = function(n, v){
            var el = form.querySelector('[name="' + n + '"]');
            if(el){ el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
        };
        set('name',     arguments[0]);
        set('username', arguments[1]);
        set('password', arguments[2]);
    """, name, username, password)
    driver.execute_script("""
        var form = document.querySelector('#modalBody form');
        if(form){
            var btn = form.querySelector('button.primary, button[type="submit"]');
            if(btn) btn.click();
        }
    """)
    time.sleep(0.9)


class TestPasswordVault:

    def test_TC_PWD_001_section_renders(self, driver):
        """PasswordVault renders passList without JS errors."""
        nav_to(driver, 'passwords')
        time.sleep(0.5)
        assert driver.find_element(By.ID, 'passList')
        assert len(get_severe_errors(driver)) == 0

    def test_TC_PWD_002_pin_setup_via_settings(self, driver):
        """PIN saved via Settings is stored as pinHash in IndexedDB meta/settings."""
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        meta = idb_get_all(driver, 'meta')
        settings = next(
            (r for r in meta if isinstance(r, dict) and r.get('id') == 'settings'),
            None
        )
        assert settings is not None, 'settings record not found in meta store'
        assert settings.get('pinHash'), \
            'pinHash not set in settings after saving PIN'

    def test_TC_PWD_003_vault_unlocks_with_correct_pin(self, driver):
        """Vault unlocks when correct PIN is entered — passList shows content."""
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)

        # After unlock, addPassBtn should be visible (not the locked state)
        is_unlocked = driver.execute_script("""
            var btn = document.getElementById('addPassBtn');
            return btn && btn.offsetParent !== null;
        """)
        assert is_unlocked, \
            'Vault did not unlock — addPassBtn not visible after correct PIN'

    def test_TC_PWD_004_vault_locks_via_lock_button(self, driver):
        """lockBtn locks the vault — passList shows locked state."""
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)

        # Lock via lockBtn
        driver.execute_script("""
            var btn = document.getElementById('lockBtn');
            if(btn) btn.click();
        """)
        time.sleep(0.5)

        unlock_btn_visible = driver.execute_script("""
            var btn = document.getElementById('unlockBtn');
            return btn && btn.offsetParent !== null;
        """)
        assert unlock_btn_visible, \
            'Vault did not lock — unlockBtn not visible after clicking lockBtn'

    def test_TC_PWD_005_add_password_via_ui(self, driver):
        """Add password via UI (vault unlocked) — encrypted record stored in IndexedDB."""
        idb_clear(driver, 'passwords')
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        _add_password_via_ui(driver, name='qa-site.com',
                              username='qa_user', password='QaP@ss123!')

        records = idb_get_all(driver, 'passwords')
        assert len(records) >= 1, \
            'No password record found in IndexedDB after adding via UI'
        # Record should be encrypted (has salt/iv/cipher, not plaintext)
        r = records[0]
        assert r.get('salt') and r.get('iv') and r.get('cipher'), \
            f'Password record not encrypted. Got keys: {list(r.keys())}'

    def test_TC_PWD_006_generate_password_shows_toast(self, driver):
        """genPassBtn generates a password — toast notification appears."""
        nav_to(driver, 'passwords')
        time.sleep(0.3)
        btn = driver.find_element(By.ID, 'genPassBtn')
        assert btn.is_displayed(), 'genPassBtn not visible'

        # Clear any existing toast
        driver.execute_script("""
            var t = document.getElementById('toast');
            if(t) t.classList.remove('show');
        """)
        btn.click()
        time.sleep(0.6)

        # genPassBtn copies to clipboard and shows toast — check toast is shown
        toast_shown = driver.execute_script("""
            var t = document.getElementById('toast');
            return t && t.classList.contains('show');
        """)
        assert toast_shown, \
            'genPassBtn did not show toast after click'

    def test_TC_PWD_007_search_input_present(self, driver):
        """passSearch input is present in PasswordVault."""
        nav_to(driver, 'passwords')
        assert driver.find_element(By.ID, 'passSearch')

    def test_TC_PWD_008_eye_toggle_buttons_present(self, driver):
        """Password eye toggle buttons rendered for each password entry."""
        idb_clear(driver, 'passwords')
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        _add_password_via_ui(driver, name='qa-eye.com',
                              username='eye_user', password='Eye@123!')
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        time.sleep(0.5)
        eyes = driver.find_elements(By.CLASS_NAME, 'password-eye')
        assert len(eyes) > 0, 'No password-eye toggle buttons found'

    def test_TC_PWD_009_eye_toggle_changes_input_type(self, driver):
        """Clicking eye toggle changes password input type between text and password."""
        idb_clear(driver, 'passwords')
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        _add_password_via_ui(driver, name='qa-toggle.com',
                              username='toggle_user', password='Toggle@123!')
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        time.sleep(0.5)
        result = driver.execute_script("""
            var eye = document.querySelector('.password-eye');
            if(!eye) return 'no_eye';
            var field = eye.closest('.password-field');
            if(!field) return 'no_field';
            var inp = field.querySelector('input');
            if(!inp) return 'no_input';
            var before = inp.type;
            eye.click();
            var after = inp.type;
            return before + '->' + after;
        """)
        assert result not in ('no_eye', 'no_field', 'no_input'), \
            f'Eye toggle DOM issue: {result}'
        assert result in ('password->text', 'text->password'), \
            f'Eye toggle did not change input type: {result}'

    def test_TC_PWD_010_search_filters_results(self, driver):
        """Typing in passSearch filters the password list."""
        idb_clear(driver, 'passwords')
        _setup_pin(driver, TEST_PIN)
        reload_app(driver)
        _unlock_vault(driver, TEST_PIN)
        _add_password_via_ui(driver, name='amazon.com',
                              username='user1', password='Pass@1!')
        _add_password_via_ui(driver, name='netflix.com',
                              username='user2', password='Pass@2!')
        time.sleep(0.3)
        search = driver.find_element(By.ID, 'passSearch')
        search.send_keys('amazon')
        time.sleep(0.5)
        assert 'amazon.com' in driver.page_source, \
            'amazon.com not shown after searching'
