import pytest
import os
import time
from selenium import webdriver
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    InvalidSessionIdException, WebDriverException,
    NoSuchElementException, TimeoutException
)
from webdriver_manager.microsoft import EdgeChromiumDriverManager

# ── Change this filename to point to the version you want to test ─────────────
APP_FILE = 'VaultOne_v1.1.html'
# ──────────────────────────────────────────────────────────────────────────────

APP_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', APP_FILE)
)
APP_URL = 'file:///' + APP_PATH.replace('\\', '/')

# Cache the driver binary path so webdriver-manager doesn't re-download each test
_DRIVER_PATH = None


def _get_driver_path():
    global _DRIVER_PATH
    if _DRIVER_PATH is None:
        _DRIVER_PATH = EdgeChromiumDriverManager().install()
    return _DRIVER_PATH


def _make_driver():
    opts = EdgeOptions()
    opts.add_argument('--allow-file-access-from-files')
    opts.add_argument('--disable-web-security')
    opts.add_argument('--start-maximized')
    opts.add_argument('--log-level=3')
    opts.add_experimental_option('excludeSwitches', ['enable-logging'])
    # Enable browser log capture
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    svc = EdgeService(_get_driver_path())
    d = webdriver.Edge(service=svc, options=opts)
    d.set_script_timeout(10)
    d.set_page_load_timeout(20)
    return d


@pytest.fixture(scope='function')
def driver():
    """Fresh browser per test — eliminates InvalidSessionIdException cascade."""
    d = _make_driver()
    d.get(APP_URL)
    _wait_app_ready(d)
    yield d
    try:
        d.quit()
    except Exception:
        pass


def _wait_app_ready(d, timeout=8):
    """Wait until the VaultOne app JS has initialised (hNet element exists)."""
    try:
        WebDriverWait(d, timeout).until(
            EC.presence_of_element_located((By.ID, 'hNet'))
        )
    except TimeoutException:
        pass


# ── IndexedDB helpers ──────────────────────────────────────────────────────────

def idb_put(driver, store, record):
    """
    Synchronously insert a record via a Promise — waits for onsuccess before
    returning, preventing race conditions between write and next operation.
    """
    driver.execute_async_script("""
        var store  = arguments[0];
        var record = arguments[1];
        var done   = arguments[2];
        var req = indexedDB.open('VaultOneDB');
        req.onerror = function(){ done('open_error'); };
        req.onsuccess = function(e){
            var db = e.target.result;
            try {
                var tx = db.transaction([store], 'readwrite');
                var r  = tx.objectStore(store).put(record);
                r.onsuccess = function(){ done('ok'); };
                r.onerror   = function(){ done('put_error'); };
            } catch(err){ done('tx_error:' + err.message); }
        };
    """, store, record)


def idb_clear(driver, store):
    """Synchronously clear an object store."""
    driver.execute_async_script("""
        var store = arguments[0];
        var done  = arguments[1];
        var req = indexedDB.open('VaultOneDB');
        req.onerror   = function(){ done('open_error'); };
        req.onsuccess = function(e){
            var db = e.target.result;
            try {
                var tx = db.transaction([store], 'readwrite');
                var r  = tx.objectStore(store).clear();
                r.onsuccess = function(){ done('ok'); };
                r.onerror   = function(){ done('clear_error'); };
            } catch(err){ done('tx_error:' + err.message); }
        };
    """, store)


def idb_get_all(driver, store):
    """Return all records from an object store synchronously."""
    return driver.execute_async_script("""
        var store = arguments[0];
        var done  = arguments[1];
        var req = indexedDB.open('VaultOneDB');
        req.onerror   = function(){ done([]); };
        req.onsuccess = function(e){
            var db = e.target.result;
            try {
                var tx = db.transaction([store], 'readonly');
                var r  = tx.objectStore(store).getAll();
                r.onsuccess = function(){ done(r.result || []); };
                r.onerror   = function(){ done([]); };
            } catch(err){ done([]); }
        };
    """, store)


# ── Navigation helpers ─────────────────────────────────────────────────────────

def nav_to(driver, section_id, wait=0.6):
    """Click bottom-nav button by data-go attribute and wait for section."""
    driver.execute_script(
        "var b=document.querySelector('[data-go=\"'+arguments[0]+'\"]');"
        "if(b) b.click();",
        section_id
    )
    try:
        WebDriverWait(driver, 5).until(
            lambda d: 'active' in (
                d.find_element(By.ID, section_id).get_attribute('class') or ''
            )
        )
    except Exception:
        time.sleep(wait)


def nav_sub(driver, sub_id, wait=0.5):
    """Click iVault sub-tab by data-sub attribute."""
    driver.execute_script(
        "var b=document.querySelector('[data-sub=\"'+arguments[0]+'\"]');"
        "if(b) b.click();",
        sub_id
    )
    time.sleep(wait)


def reload_app(driver):
    driver.get(APP_URL)
    _wait_app_ready(driver)


def get_text(driver, element_id):
    try:
        return driver.find_element(By.ID, element_id).text.strip()
    except Exception:
        return ''


def wait_for(driver, by, selector, timeout=6):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )


def wait_clickable(driver, by, selector, timeout=6):
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )


def click_button_by_text(driver, text, scope='.sheet,.modal,body'):
    """Click the first visible button whose text contains `text`."""
    driver.execute_script("""
        var text   = arguments[0];
        var btns   = Array.from(document.querySelectorAll('button'));
        var target = btns.find(b =>
            b.offsetParent !== null &&
            b.textContent.trim().toLowerCase().includes(text.toLowerCase())
        );
        if(target) target.click();
        return !!target;
    """, text)
    time.sleep(0.4)


def sheet_is_open(driver):
    """Return True if a bottom sheet or modal is currently visible."""
    return driver.execute_script("""
        var sheet = document.querySelector('.sheet');
        var modal = document.querySelector('.modal.open');
        return (sheet && sheet.offsetParent !== null) || !!modal;
    """)


def close_sheet(driver):
    """Close any open sheet by clicking Cancel or pressing Escape."""
    click_button_by_text(driver, 'cancel')
    time.sleep(0.3)


def get_severe_errors(driver):
    try:
        logs = driver.get_log('browser')
        return [l for l in logs if l.get('level') == 'SEVERE']
    except Exception:
        return []


# ── Mobile emulation ───────────────────────────────────────────────────────────

# Pixel 5 dimensions — representative Android flagship
MOBILE_DEVICE = {
    'deviceName': 'Pixel 5',
    'width': 393,
    'height': 851,
    'deviceScaleFactor': 2.75,
    'mobile': True,
    'touch': True,
}


def _make_mobile_driver():
    opts = EdgeOptions()
    opts.add_argument('--allow-file-access-from-files')
    opts.add_argument('--disable-web-security')
    opts.add_argument('--log-level=3')
    opts.add_experimental_option('excludeSwitches', ['enable-logging'])
    opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
    # Enable mobile emulation via DevTools device metrics
    opts.add_experimental_option('mobileEmulation', {
        'deviceMetrics': {
            'width': MOBILE_DEVICE['width'],
            'height': MOBILE_DEVICE['height'],
            'pixelRatio': MOBILE_DEVICE['deviceScaleFactor'],
            'touch': MOBILE_DEVICE['touch'],
        },
        'userAgent': (
            'Mozilla/5.0 (Linux; Android 12; Pixel 5) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Mobile Safari/537.36 Edg/120.0.0.0'
        ),
    })
    svc = EdgeService(_get_driver_path())
    d = webdriver.Edge(service=svc, options=opts)
    d.set_script_timeout(10)
    d.set_page_load_timeout(20)
    return d


@pytest.fixture(scope='function')
def mobile_driver():
    """Fresh mobile-emulated browser (Pixel 5) per test."""
    d = _make_mobile_driver()
    d.get(APP_URL)
    _wait_app_ready(d)
    yield d
    try:
        d.quit()
    except Exception:
        pass


def element_rect(driver, selector_or_id, by_id=True):
    """Return bounding rect dict for an element."""
    by = 'getElementById' if by_id else 'querySelector'
    return driver.execute_script(
        f"var el=document.{by}(arguments[0]);"
        "return el ? el.getBoundingClientRect() : null;",
        selector_or_id
    )


def viewport_width(driver):
    return driver.execute_script('return window.innerWidth;')


def viewport_height(driver):
    return driver.execute_script('return window.innerHeight;')


def has_horizontal_scroll(driver):
    """True if the page body overflows horizontally."""
    return driver.execute_script(
        'return document.documentElement.scrollWidth > window.innerWidth;'
    )
