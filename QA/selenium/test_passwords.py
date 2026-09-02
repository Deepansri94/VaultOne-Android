"""PasswordVault Selenium Tests — modular architecture (v1.9 split)."""
import time
import pytest
from selenium.webdriver.common.by import By
from conftest import PASSWORD_URL, click, fill, get_toast, clear_idb, open_settings

TEST_PIN = '123456'


@pytest.fixture(autouse=True)
def fresh_db(driver):
    driver.get(PASSWORD_URL)
    time.sleep(0.5)
    clear_idb(driver, 'PasswordVaultDB')
    driver.get(PASSWORD_URL)
    time.sleep(1)


def _set_pin_and_unlock(driver, pin=TEST_PIN):
    click(driver, By.ID, 'setPinBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="pin"]', pin)
    fill(driver, By.CSS_SELECTOR, 'input[name="pin2"]', pin)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)


def _add_password(driver, name='Gmail', username='test@gmail.com', password='SecurePass@123'):
    click(driver, By.ID, 'addPassBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', name)
    fill(driver, By.CSS_SELECTOR, 'input[name="username"]', username)
    fill(driver, By.CSS_SELECTOR, 'input[name="password"]', password)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)


# ── TC-PV-001  Page load ──────────────────────────────────────────────────
def test_page_loads(driver):
    """PasswordVault page loads with correct title and h1."""
    assert 'PasswordVault' in driver.title
    assert 'PasswordVault' in driver.find_element(By.TAG_NAME, 'h1').text


# ── TC-PV-002  Locked state shown ────────────────────────────────────────
def test_locked_state_shown(driver):
    """Vault shows 'No Vault PIN' state on fresh DB."""
    text = driver.find_element(By.ID, 'passList').text
    assert 'No Vault PIN' in text or 'locked' in text.lower()


# ── TC-PV-003  Set PIN and unlock ────────────────────────────────────────
def test_set_pin_and_unlock(driver):
    """User can set a PIN and unlock the vault."""
    _set_pin_and_unlock(driver)
    assert 'No passwords stored' in driver.find_element(By.ID, 'passList').text


# ── TC-PV-004  Add password ───────────────────────────────────────────────
def test_add_password(driver):
    """User can add a password entry; it appears in the list."""
    _set_pin_and_unlock(driver)
    _add_password(driver, 'Gmail', 'test@gmail.com', 'SecurePass@123')
    assert 'Gmail' in driver.find_element(By.ID, 'passList').text


# ── TC-PV-005  Password entry shows username ──────────────────────────────
def test_password_shows_username(driver):
    """Password entry displays the username/email."""
    _set_pin_and_unlock(driver)
    _add_password(driver, 'GitHub', 'dev@github.com', 'GitPass@456')
    assert 'dev@github.com' in driver.find_element(By.ID, 'passList').text


# ── TC-PV-006  Search passwords ───────────────────────────────────────────
def test_search_passwords(driver):
    """Search filters password entries by service name."""
    _set_pin_and_unlock(driver)
    _add_password(driver, 'Netflix', 'user@netflix.com', 'NetPass@456')
    search = driver.find_element(By.ID, 'passSearch')
    search.clear()
    search.send_keys('Netflix')
    time.sleep(0.4)
    assert 'Netflix' in driver.find_element(By.ID, 'passList').text
    search.clear()
    search.send_keys('zzznomatch')
    time.sleep(0.4)
    assert 'No passwords' in driver.find_element(By.ID, 'passList').text


# ── TC-PV-007  Lock vault ─────────────────────────────────────────────────
def test_lock_vault(driver):
    """Lock button locks the vault."""
    _set_pin_and_unlock(driver)
    click(driver, By.ID, 'lockBtn')
    time.sleep(0.3)
    assert 'locked' in driver.find_element(By.ID, 'passList').text.lower()


# ── TC-PV-008  Unlock with correct PIN ───────────────────────────────────
def test_unlock_with_correct_pin(driver):
    """Vault unlocks with the correct PIN after being locked."""
    _set_pin_and_unlock(driver)
    click(driver, By.ID, 'lockBtn')
    time.sleep(0.3)
    click(driver, By.ID, 'unlockBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="pin"]', TEST_PIN)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert 'No passwords stored' in driver.find_element(By.ID, 'passList').text


# ── TC-PV-009  Wrong PIN rejected ────────────────────────────────────────
def test_wrong_pin_rejected(driver):
    """Wrong PIN shows error toast and does not unlock."""
    _set_pin_and_unlock(driver)
    click(driver, By.ID, 'lockBtn')
    time.sleep(0.3)
    click(driver, By.ID, 'unlockBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="pin"]', '000000')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    toast = get_toast(driver)
    assert 'invalid' in toast.lower() or 'Invalid' in toast
    assert 'locked' in driver.find_element(By.ID, 'passList').text.lower()


# ── TC-PV-010  Delete password ────────────────────────────────────────────
def test_delete_password(driver):
    """User can delete a password entry."""
    _set_pin_and_unlock(driver)
    _add_password(driver, 'ToDelete', 'del@test.com', 'DelPass@789')
    driver.execute_script('window.confirm = () => true;')
    driver.find_element(By.CSS_SELECTOR, '[data-pdel]').click()
    time.sleep(0.5)
    assert 'ToDelete' not in driver.find_element(By.ID, 'passList').text


# ── TC-PV-011  Generate password ─────────────────────────────────────────
def test_generate_password(driver):
    """Generate password button produces a toast confirming generation."""
    click(driver, By.ID, 'genPassBtn')
    time.sleep(0.5)
    toast = get_toast(driver)
    assert 'generated' in toast.lower() or 'copied' in toast.lower()


# ── TC-PV-012  Generate inside modal ─────────────────────────────────────
def test_generate_inside_modal(driver):
    """Generate button inside Add Password modal fills the password field."""
    _set_pin_and_unlock(driver)
    click(driver, By.ID, 'addPassBtn')
    time.sleep(0.3)
    gen_btn = driver.find_element(By.ID, 'genInside')
    gen_btn.click()
    time.sleep(0.3)
    pw_field = driver.find_element(By.CSS_SELECTOR, 'input[name="password"]')
    assert len(pw_field.get_attribute('value')) >= 16


# ── TC-PV-013  Password expiry reminder ──────────────────────────────────
def test_password_expiry_reminder(driver):
    """Adding a password with expiry date auto-creates a reminder."""
    _set_pin_and_unlock(driver)
    click(driver, By.ID, 'addPassBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'Expiry Test')
    fill(driver, By.CSS_SELECTOR, 'input[name="username"]', 'exp@test.com')
    fill(driver, By.CSS_SELECTOR, 'input[name="password"]', 'ExpPass@123')
    fill(driver, By.CSS_SELECTOR, 'input[name="expiryDate"]', '2099-12-31')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    badge = driver.find_element(By.ID, 'bellReminderBadge')
    assert badge.is_displayed()
    assert int(badge.text or '0') >= 1


# ── TC-PV-014  Bell panel opens ───────────────────────────────────────────
def test_bell_panel_opens(driver):
    """Bell icon opens the reminders panel."""
    click(driver, By.ID, 'bellReminderBtn')
    time.sleep(0.3)
    panel = driver.find_element(By.ID, 'reminderFloatingPanel')
    assert 'open' in panel.get_attribute('class')


# ── TC-PV-015  Add reminder from bell panel ───────────────────────────────
def test_add_reminder(driver):
    """Reminder can be added from the bell panel."""
    click(driver, By.ID, 'bellReminderBtn')
    time.sleep(0.3)
    click(driver, By.ID, 'floatingAddReminderBtn')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="title"]', 'Test Reminder')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="date"]', '2099-12-31')
    driver.find_element(By.CSS_SELECTOR, '#bellReminderForm button[type="submit"]').click()
    time.sleep(0.5)
    assert 'Test Reminder' in driver.find_element(By.ID, 'bellRemList').text


# ── TC-PV-016  Settings panel saves name ─────────────────────────────────
def test_settings_panel(driver):
    """Settings panel opens and saves display name."""
    open_settings(driver)
    time.sleep(0.3)
    name_input = driver.find_element(By.ID, 'spName')
    name_input.clear()
    name_input.send_keys('Vault User')
    driver.find_element(By.ID, 'spSave').click()
    time.sleep(0.5)
    assert 'saved' in get_toast(driver).lower()


# ── TC-PV-017  Export JSON via settings panel ─────────────────────────────
def test_export_json(driver):
    """Export JSON via settings panel does not produce an error toast."""
    open_settings(driver)
    time.sleep(0.3)
    driver.find_element(By.ID, 'spExportBtn').click()
    time.sleep(1)
    assert 'failed' not in get_toast(driver).lower()


# ── TC-PV-018  Home button navigates to index ─────────────────────────────
def test_home_button(driver):
    """Home button links to index.html."""
    home_btn = driver.find_element(By.CSS_SELECTOR, 'a.home-btn')
    assert 'index.html' in home_btn.get_attribute('href')
