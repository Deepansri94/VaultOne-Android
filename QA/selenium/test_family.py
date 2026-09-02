"""FamilyVault Selenium Tests — modular architecture (v1.9 split)."""
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from conftest import FAMILY_URL, click, fill, get_toast, clear_idb, open_settings


@pytest.fixture(autouse=True)
def fresh_db(driver):
    driver.get(FAMILY_URL)
    time.sleep(0.5)
    clear_idb(driver, 'FamilyVaultDB')
    driver.get(FAMILY_URL)
    time.sleep(1)


def _add_household(driver, name='Test House'):
    click(driver, By.ID, 'addHouseBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', name)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)


def _add_person(driver, name='John Doe', relation='Member'):
    click(driver, By.ID, 'addPersonBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', name)
    fill(driver, By.CSS_SELECTOR, 'input[name="relation"]', relation)
    Select(driver.find_element(By.CSS_SELECTOR, 'select[name="householdId"]')).select_by_index(1)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)


# ── TC-FV-001  Page load ──────────────────────────────────────────────────
def test_page_loads(driver):
    """FamilyVault page loads with correct title and h1."""
    assert 'FamilyVault' in driver.title
    assert 'FamilyVault' in driver.find_element(By.TAG_NAME, 'h1').text


# ── TC-FV-002  Tile counts start at zero ─────────────────────────────────
def test_tile_counts_zero(driver):
    """All tile counts start at zero on fresh DB."""
    for cnt_id in ('cntPeople', 'cntHouses', 'cntVehicles', 'cntDocs'):
        assert driver.find_element(By.ID, cnt_id).text == '0'


# ── TC-FV-003  Add household ──────────────────────────────────────────────
def test_add_household(driver):
    """User can add a household; count increments to 1."""
    click(driver, By.ID, 'addHouseBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'My Home')
    fill(driver, By.CSS_SELECTOR, 'input[name="description"]', 'Primary residence')
    fill(driver, By.CSS_SELECTOR, 'textarea[name="address"]', '123 Main St, Chennai')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert driver.find_element(By.ID, 'cntHouses').text == '1'


# ── TC-FV-004  Add person ─────────────────────────────────────────────────
def test_add_person(driver):
    """User can add a person after creating a household."""
    _add_household(driver)
    _add_person(driver, 'Jane Doe', 'Spouse')
    assert driver.find_element(By.ID, 'cntPeople').text == '1'


# ── TC-FV-005  People tile shows list ────────────────────────────────────
def test_people_tile_shows_list(driver):
    """Clicking People tile shows the people list."""
    _add_household(driver)
    _add_person(driver, 'Alice Smith')
    click(driver, By.ID, 'tile-people')
    time.sleep(0.3)
    assert 'Alice Smith' in driver.find_element(By.ID, 'familyList').text


# ── TC-FV-006  Birthday reminder auto-created ─────────────────────────────
def test_birthday_reminder_created(driver):
    """Adding an Active person with DOB auto-creates a birthday reminder."""
    _add_household(driver)
    click(driver, By.ID, 'addPersonBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'Birthday Person')
    fill(driver, By.CSS_SELECTOR, 'input[name="relation"]', 'Member')
    Select(driver.find_element(By.CSS_SELECTOR, 'select[name="householdId"]')).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, 'input[name="dob"]', '1990-08-15')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    badge = driver.find_element(By.ID, 'bellReminderBadge')
    assert badge.is_displayed()
    assert int(badge.text or '0') >= 1


# ── TC-FV-007  Add vehicle ────────────────────────────────────────────────
def test_add_vehicle(driver):
    """User can add a vehicle; count increments to 1."""
    _add_household(driver)
    _add_person(driver, 'Car Owner')
    click(driver, By.ID, 'addVehicleBtn')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'My Car')
    fill(driver, By.CSS_SELECTOR, 'input[name="registrationNumber"]', 'TN01AB1234')
    fill(driver, By.CSS_SELECTOR, 'input[name="make"]', 'Maruti')
    fill(driver, By.CSS_SELECTOR, 'input[name="model"]', 'Swift')
    Select(driver.find_element(By.CSS_SELECTOR, 'select[name="ownerPersonId"]')).select_by_index(1)
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert driver.find_element(By.ID, 'cntVehicles').text == '1'


# ── TC-FV-008  Add document ───────────────────────────────────────────────
def test_add_document(driver):
    """User can add a document; count increments to 1."""
    _add_household(driver)
    _add_person(driver, 'Doc Owner')
    click(driver, By.ID, 'addDocBtn')
    # Wait for modal input to be interactable
    WebDriverWait(driver, 8).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, '#modalBody input[name="title"]'))
    )
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="title"]', 'Aadhaar Card')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('Aadhaar')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="ownerType"]')).select_by_visible_text('Person')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="personId"]')).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="documentNumber"]', '1234-5678-9012')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert driver.find_element(By.ID, 'cntDocs').text == '1'


# ── TC-FV-009  Document search ────────────────────────────────────────────
def test_document_search(driver):
    """Document search filters results correctly."""
    _add_household(driver)
    _add_person(driver, 'Search Person')
    click(driver, By.ID, 'addDocBtn')
    WebDriverWait(driver, 8).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, '#modalBody input[name="title"]'))
    )
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="title"]', 'PAN Card')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('PAN')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="ownerType"]')).select_by_visible_text('Person')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="personId"]')).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="documentNumber"]', 'ABCDE1234F')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.4)

    click(driver, By.ID, 'tile-documents')
    time.sleep(0.3)
    search = driver.find_element(By.ID, 'docSearch')
    search.clear()
    search.send_keys('PAN')
    time.sleep(0.4)
    assert 'PAN Card' in driver.find_element(By.ID, 'familyList').text

    search.clear()
    search.send_keys('zzznomatch')
    time.sleep(0.4)
    assert 'No documents' in driver.find_element(By.ID, 'familyList').text


# ── TC-FV-010  Document details modal ────────────────────────────────────
def test_document_details_masked(driver):
    """Document details modal shows masked document number."""
    _add_household(driver)
    _add_person(driver, 'Detail Person')
    click(driver, By.ID, 'addDocBtn')
    WebDriverWait(driver, 8).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, '#modalBody input[name="title"]'))
    )
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="title"]', 'Passport')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('Passport')
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="ownerType"]')).select_by_visible_text('Person')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="personId"]')).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="documentNumber"]', 'A1234567')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.4)

    click(driver, By.ID, 'tile-documents')
    time.sleep(0.3)
    click(driver, By.CSS_SELECTOR, '[data-dview]')
    time.sleep(0.3)
    modal_text = driver.find_element(By.ID, 'modalBody').text
    assert '•' in modal_text  # number should be masked
    assert 'A1234567' not in modal_text


# ── TC-FV-011  Cannot delete household with members ───────────────────────
def test_delete_household_blocked(driver):
    """Cannot delete a household that has linked members."""
    _add_household(driver, 'Blocked House')
    _add_person(driver, 'Linked Person')
    click(driver, By.ID, 'tile-households')
    time.sleep(0.3)
    driver.execute_script('window.confirm = () => true;')
    driver.find_element(By.CSS_SELECTOR, '[data-hdel]').click()
    time.sleep(0.5)
    assert 'Cannot delete' in get_toast(driver)


# ── TC-FV-012  Edit household ─────────────────────────────────────────────
def test_edit_household(driver):
    """User can edit a household name."""
    _add_household(driver, 'Old Name')
    click(driver, By.ID, 'tile-households')
    time.sleep(0.3)
    click(driver, By.CSS_SELECTOR, '[data-hedit]')
    time.sleep(0.3)
    name_input = driver.find_element(By.CSS_SELECTOR, '#modalBody input[name="name"]')
    name_input.clear()
    name_input.send_keys('New Name')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    # Re-click tile to refresh the list view
    click(driver, By.ID, 'tile-households')
    time.sleep(0.3)
    assert 'New Name' in driver.find_element(By.ID, 'familyList').text


# ── TC-FV-013  Settings panel saves name ─────────────────────────────────
def test_settings_panel(driver):
    """Settings panel opens and saves display name."""
    open_settings(driver)
    time.sleep(0.3)
    name_input = driver.find_element(By.ID, 'spName')
    name_input.clear()
    name_input.send_keys('Family User')
    driver.find_element(By.ID, 'spSave').click()
    time.sleep(0.5)
    assert 'saved' in get_toast(driver).lower()


# ── TC-FV-014  Export JSON via settings panel ─────────────────────────────
def test_export_json(driver):
    """Export JSON via settings panel does not produce an error toast."""
    open_settings(driver)
    time.sleep(0.3)
    driver.find_element(By.ID, 'spFvExportBtn').click()
    time.sleep(1)
    assert 'failed' not in get_toast(driver).lower()


# ── TC-FV-015  Reminder add from bell panel ───────────────────────────────
def test_reminder_add(driver):
    """Reminder can be added from the bell panel."""
    click(driver, By.ID, 'bellReminderBtn')
    time.sleep(0.3)
    click(driver, By.ID, 'floatingAddReminderBtn')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="title"]', 'Family Reminder')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="date"]', '2099-06-01')
    driver.find_element(By.CSS_SELECTOR, '#bellReminderForm button[type="submit"]').click()
    time.sleep(0.5)
    assert 'Family Reminder' in driver.find_element(By.ID, 'bellRemList').text


# ── TC-FV-016  Home button navigates to index ─────────────────────────────
def test_home_button(driver):
    """Home button links to index.html."""
    home_btn = driver.find_element(By.CSS_SELECTOR, 'a.home-btn')
    assert 'index.html' in home_btn.get_attribute('href')
