"""Shared fixtures and helpers for VaultOne Selenium test suite."""
import os
import time
import threading
import http.server
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HTTP_PORT = 8765

def _start_server():
    os.chdir(BASE_DIR)  # serve from project root
    handler = http.server.SimpleHTTPRequestHandler
    handler.log_message = lambda *a: None  # silence logs
    httpd = http.server.HTTPServer(('127.0.0.1', HTTP_PORT), handler)
    httpd.serve_forever()

# Start HTTP server once for the whole session
_server_thread = threading.Thread(target=_start_server, daemon=True)
_server_thread.start()
time.sleep(0.5)  # give server time to bind

def page_url(filename):
    return f'http://127.0.0.1:{HTTP_PORT}/{filename}'

INDEX_URL    = page_url('index.html')
IVAULT_URL   = page_url('iVault.html')
FAMILY_URL   = page_url('FamilyVault.html')
PASSWORD_URL = page_url('PasswordVault.html')

@pytest.fixture(scope='session')
def driver():
    opts = Options()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--window-size=1280,900')
    d = webdriver.Chrome(options=opts)
    d.implicitly_wait(4)
    yield d
    d.quit()

@pytest.fixture(scope='function')
def wait(driver):
    return WebDriverWait(driver, 10)

# ── Low-level helpers ──────────────────────────────────────────────────────

def click(driver, by, value, timeout=8):
    el = WebDriverWait(driver, timeout).until(EC.element_to_be_clickable((by, value)))
    el.click()
    return el

def fill(driver, by, value, text, timeout=8):
    el = WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))
    el.clear()
    el.send_keys(text)
    return el

def set_date(driver, by, value, iso_date, timeout=8):
    """Set a date input via JS to avoid Windows Chrome MM/DD/YYYY quirk."""
    el = WebDriverWait(driver, timeout).until(EC.presence_of_element_located((by, value)))
    driver.execute_script("arguments[0].value = arguments[1];", el, iso_date)
    return el

def get_toast(driver):
    try:
        return driver.find_element(By.ID, 'toast').text
    except Exception:
        return ''

def clear_idb(driver, db_name):
    """Navigate to a blank page context that allows IDB, delete the DB, then the caller loads the real page."""
    # Must already be on an http page for IDB to work; caller should load page first
    try:
        driver.execute_script(f"""
            var req = indexedDB.deleteDatabase('{db_name}');
        """)
    except Exception:
        pass
    time.sleep(0.5)

def open_settings(driver):
    click(driver, By.ID, 'settingsBtn')
    time.sleep(0.3)

def close_modal(driver):
    try:
        btn = driver.find_element(By.ID, 'modalClose')
        if btn.is_displayed():
            btn.click()
            time.sleep(0.2)
    except Exception:
        pass
