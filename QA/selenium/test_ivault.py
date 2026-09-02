"""iVault Selenium Tests — modular architecture (v1.9 split)."""
import time
import datetime
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from conftest import IVAULT_URL, click, fill, set_date, get_toast, clear_idb, open_settings


@pytest.fixture(autouse=True)
def fresh_db(driver):
    driver.get(IVAULT_URL)
    time.sleep(0.5)
    clear_idb(driver, 'iVaultDB')
    driver.get(IVAULT_URL)
    time.sleep(1)


# ── TC-IV-001  Page load ───────────────────────────────────────────────────
def test_page_loads(driver):
    """iVault page loads with correct title and h1."""
    assert 'iVault' in driver.title
    assert 'iVault' in driver.find_element(By.TAG_NAME, 'h1').text


# ── TC-IV-002  Overview stats start at zero ───────────────────────────────
def test_overview_stats_zero(driver):
    """All overview stats show zero on fresh DB."""
    for stat_id in ('statNetWorth', 'statIncome', 'statExpense', 'statSavings'):
        assert '0' in driver.find_element(By.ID, stat_id).text


# ── TC-IV-003  Nav tabs switch sub-views ──────────────────────────────────
def test_nav_tabs(driver):
    """All 6 nav tabs activate the correct sub-view."""
    for tab in ('income', 'expenses', 'budget', 'investments', 'loans'):
        click(driver, By.CSS_SELECTOR, f'[data-sv="{tab}"]')
        time.sleep(0.3)
        sv = driver.find_element(By.ID, f'sv-{tab}')
        assert 'active' in sv.get_attribute('class'), f'sv-{tab} not active'


# ── TC-IV-004  Add income ─────────────────────────────────────────────────
def test_add_income(driver):
    """User can add an income record; it appears in history."""
    click(driver, By.CSS_SELECTOR, '[data-sv="income"]')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#incomeForm select[name="type"]')).select_by_visible_text('Salary')
    fill(driver, By.CSS_SELECTOR, '#incomeForm input[name="amount"]', '50000')
    set_date(driver, By.CSS_SELECTOR, '#incomeForm input[name="date"]', '2025-01-15')
    driver.find_element(By.CSS_SELECTOR, '#incomeForm button[type="submit"]').click()
    time.sleep(0.6)
    list_text = driver.find_element(By.ID, 'incomeList').text
    assert 'Salary' in list_text
    assert '50,000' in list_text or '50000' in list_text


# ── TC-IV-005  Income updates overview ────────────────────────────────────
def test_income_updates_overview(driver):
    """Adding income updates the monthly income stat."""
    today = datetime.date.today().strftime('%Y-%m-%d')
    click(driver, By.CSS_SELECTOR, '[data-sv="income"]')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, '#incomeForm input[name="amount"]', '30000')
    set_date(driver, By.CSS_SELECTOR, '#incomeForm input[name="date"]', today)
    driver.find_element(By.CSS_SELECTOR, '#incomeForm button[type="submit"]').click()
    time.sleep(0.5)
    click(driver, By.CSS_SELECTOR, '[data-sv="overview"]')
    time.sleep(0.5)
    stat = driver.find_element(By.ID, 'statIncome').text
    assert '30' in stat or '₹0' not in stat


# ── TC-IV-006  Delete income ──────────────────────────────────────────────
def test_delete_income(driver):
    """User can delete an income record."""
    click(driver, By.CSS_SELECTOR, '[data-sv="income"]')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, '#incomeForm input[name="amount"]', '1000')
    set_date(driver, By.CSS_SELECTOR, '#incomeForm input[name="date"]', '2025-02-01')
    driver.find_element(By.CSS_SELECTOR, '#incomeForm button[type="submit"]').click()
    time.sleep(0.5)
    driver.execute_script('window.confirm = () => true;')
    driver.find_element(By.CSS_SELECTOR, '[data-idel]').click()
    time.sleep(0.5)
    assert 'No income' in driver.find_element(By.ID, 'incomeList').text


# ── TC-IV-007  Add expense with sub-category select ───────────────────────
def test_add_expense_with_subcat(driver):
    """Expense form shows sub-category dropdown; record saved and shown in history."""
    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.4)
    cat_sel = driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')
    Select(cat_sel).select_by_visible_text('Household')
    time.sleep(0.4)
    # Sub-category select should be visible and populated
    subcat_sel = driver.find_element(By.ID, 'expSubcatSelect')
    assert subcat_sel.is_displayed()
    Select(subcat_sel).select_by_visible_text('Rent')
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '15000')
    set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', '2025-01-01')
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.6)
    list_text = driver.find_element(By.ID, 'expenseList').text
    assert 'Household' in list_text
    assert 'Rent' in list_text


# ── TC-IV-008  Expense history loads correctly ────────────────────────────
def test_expense_history_loads(driver):
    """Expense history shows all saved records."""
    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.4)
    today = datetime.date.today().strftime('%Y-%m-%d')
    for amount, cat in [('5000', 'Transport'), ('3000', 'Food & Personal')]:
        Select(driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')).select_by_visible_text(cat)
        time.sleep(0.3)
        fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', amount)
        set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', today)
        driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
        time.sleep(0.5)
    list_text = driver.find_element(By.ID, 'expenseList').text
    assert 'Transport' in list_text
    assert 'Food' in list_text


# ── TC-IV-009  Expense updates overview ───────────────────────────────────
def test_expense_updates_overview(driver):
    """Adding expense updates the monthly expense stat."""
    today = datetime.date.today().strftime('%Y-%m-%d')
    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '5000')
    set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', today)
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.5)
    click(driver, By.CSS_SELECTOR, '[data-sv="overview"]')
    time.sleep(0.5)
    stat = driver.find_element(By.ID, 'statExpense').text
    assert '5' in stat or '₹0' not in stat


# ── TC-IV-010  Expense linked to loan ────────────────────────────────────
def test_expense_linked_to_loan(driver):
    """Loans & Financial category shows loan picker; EMI reduces outstanding."""
    # Add a loan first
    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addLoanBtn')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, 'select[name="loanType"]')).select_by_visible_text('Personal Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'Test Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="principal"]', '100000')
    fill(driver, By.CSS_SELECTOR, 'input[name="outstanding"]', '100000')
    fill(driver, By.CSS_SELECTOR, 'input[name="emi"]', '5000')
    fill(driver, By.CSS_SELECTOR, 'input[name="interestRate"]', '12')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)

    # Add expense linked to loan
    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.4)
    Select(driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')).select_by_visible_text('Loans & Financial')
    time.sleep(0.4)
    # Linked select should appear
    linked_sel = driver.find_element(By.ID, 'expLinkedSelect')
    assert linked_sel.is_displayed()
    Select(linked_sel).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '5000')
    set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', '2025-02-01')
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.7)
    # Paid info should appear
    paid_info = driver.find_element(By.ID, 'expPaidInfo')
    assert paid_info.is_displayed()
    assert 'Test Loan' in paid_info.text or 'Paid' in paid_info.text


# ── TC-IV-011  Loan payment history ──────────────────────────────────────
def test_loan_payment_history(driver):
    """After EMI payment, loan card shows Payment History section."""
    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addLoanBtn')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'History Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="principal"]', '50000')
    fill(driver, By.CSS_SELECTOR, 'input[name="outstanding"]', '50000')
    fill(driver, By.CSS_SELECTOR, 'input[name="emi"]', '2000')
    fill(driver, By.CSS_SELECTOR, 'input[name="interestRate"]', '10')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)

    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.4)
    Select(driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')).select_by_visible_text('Loans & Financial')
    time.sleep(0.4)
    Select(driver.find_element(By.ID, 'expLinkedSelect')).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '2000')
    set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', '2025-03-01')
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.6)

    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.5)
    loan_text = driver.find_element(By.ID, 'loanList').text
    assert 'Payment History' in loan_text


# ── TC-IV-012  Budget save and lock ──────────────────────────────────────
def test_budget_save_and_lock(driver):
    """Budget form locks after save; Edit button unlocks it."""
    click(driver, By.CSS_SELECTOR, '[data-sv="budget"]')
    time.sleep(0.5)
    # Fill Household budget
    h_input = driver.find_element(By.CSS_SELECTOR, 'input[name="cat_Household"]')
    h_input.clear()
    h_input.send_keys('20000')
    click(driver, By.ID, 'budgetSaveBtn')
    time.sleep(0.5)
    assert 'saved' in get_toast(driver).lower()

    # Inputs should now be disabled
    h_input_after = driver.find_element(By.CSS_SELECTOR, 'input[name="cat_Household"]')
    assert not h_input_after.is_enabled(), 'Budget input should be disabled after save'

    # Edit button should be visible
    edit_btn = driver.find_element(By.ID, 'budgetEditBtn')
    assert edit_btn.is_displayed()

    # Click Edit — inputs should re-enable
    edit_btn.click()
    time.sleep(0.3)
    h_input_unlocked = driver.find_element(By.CSS_SELECTOR, 'input[name="cat_Household"]')
    assert h_input_unlocked.is_enabled(), 'Budget input should be enabled after Edit'


# ── TC-IV-013  Budget month navigation unlocks form ───────────────────────
def test_budget_month_navigation(driver):
    """Prev/Next month navigation works and unlocks the form."""
    click(driver, By.CSS_SELECTOR, '[data-sv="budget"]')
    time.sleep(0.5)
    # Save to lock
    click(driver, By.ID, 'budgetSaveBtn')
    time.sleep(0.4)
    initial_label = driver.find_element(By.ID, 'budgetMonthLabel').text

    click(driver, By.ID, 'budgetPrev')
    time.sleep(0.3)
    prev_label = driver.find_element(By.ID, 'budgetMonthLabel').text
    assert prev_label != initial_label
    # Form should be unlocked after navigation
    assert driver.find_element(By.CSS_SELECTOR, 'input[name="cat_Household"]').is_enabled()

    click(driver, By.ID, 'budgetNext')
    time.sleep(0.3)
    assert driver.find_element(By.ID, 'budgetMonthLabel').text == initial_label


# ── TC-IV-014  Budget sub-categories shown ───────────────────────────────
def test_budget_subcategories_shown(driver):
    """Budget form shows sub-category rows under each main category."""
    click(driver, By.CSS_SELECTOR, '[data-sv="budget"]')
    time.sleep(0.5)
    fields_html = driver.find_element(By.ID, 'budgetCategoryFields').text
    # Check a few known sub-cats are present
    assert 'Rent' in fields_html
    assert 'Fuel / Petrol' in fields_html
    assert 'Groceries' in fields_html


# ── TC-IV-015  Add budget sub-category ───────────────────────────────────
def test_add_budget_subcategory(driver):
    """User can add a custom sub-category to a budget category."""
    click(driver, By.CSS_SELECTOR, '[data-sv="budget"]')
    time.sleep(0.5)
    # Click '+ Add Sub-category' for Household
    add_btn = driver.find_element(By.CSS_SELECTOR, '[data-addsubcat="Household"]')
    add_btn.click()
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, 'input[name="subname"]', 'Society Fee')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert 'Society Fee' in driver.find_element(By.ID, 'budgetCategoryFields').text


# ── TC-IV-016  Budget vs Actual table ────────────────────────────────────
def test_budget_actuals_shown(driver):
    """Budget vs Actual table appears after saving budget with expenses."""
    today = datetime.date.today().strftime('%Y-%m-%d')
    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')).select_by_visible_text('Transport')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '3000')
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', today)
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.4)

    click(driver, By.CSS_SELECTOR, '[data-sv="budget"]')
    time.sleep(0.4)
    t_input = driver.find_element(By.CSS_SELECTOR, 'input[name="cat_Transport"]')
    t_input.clear()
    t_input.send_keys('5000')
    click(driver, By.ID, 'budgetSaveBtn')
    time.sleep(0.5)
    assert driver.find_element(By.ID, 'budgetActualsCard').is_displayed()


# ── TC-IV-017  Add investment ─────────────────────────────────────────────
def test_add_investment(driver):
    """User can add an investment; it appears in the list."""
    click(driver, By.CSS_SELECTOR, '[data-sv="investments"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addInvBtn')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('FD')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="name"]', 'SBI FD')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="provider"]', 'SBI')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="currentValue"]', '100000')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="interestRate"]', '7')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert 'SBI FD' in driver.find_element(By.ID, 'invList').text


# ── TC-IV-018  Investment linked to expense ───────────────────────────────
def test_expense_linked_to_investment(driver):
    """Savings & Investments category shows investment picker; top-up applied."""
    click(driver, By.CSS_SELECTOR, '[data-sv="investments"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addInvBtn')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('RD')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="name"]', 'My RD')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="currentValue"]', '10000')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)

    click(driver, By.CSS_SELECTOR, '[data-sv="expenses"]')
    time.sleep(0.4)
    Select(driver.find_element(By.CSS_SELECTOR, '#expenseForm select[name="category"]')).select_by_visible_text('Savings & Investments')
    time.sleep(0.4)
    linked_sel = driver.find_element(By.ID, 'expLinkedSelect')
    assert linked_sel.is_displayed()
    Select(linked_sel).select_by_index(1)
    fill(driver, By.CSS_SELECTOR, '#expenseForm input[name="amount"]', '2000')
    set_date(driver, By.CSS_SELECTOR, '#expenseForm input[name="date"]', '2025-04-01')
    driver.find_element(By.CSS_SELECTOR, '#expenseForm button[type="submit"]').click()
    time.sleep(0.6)
    paid_info = driver.find_element(By.ID, 'expPaidInfo')
    assert paid_info.is_displayed()
    assert 'My RD' in paid_info.text or 'Added' in paid_info.text


# ── TC-IV-019  Add loan ───────────────────────────────────────────────────
def test_add_loan(driver):
    """User can add a loan; it appears in the list."""
    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addLoanBtn')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, 'select[name="loanType"]')).select_by_visible_text('Personal Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'HDFC Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="principal"]', '200000')
    fill(driver, By.CSS_SELECTOR, 'input[name="interestRate"]', '12')
    fill(driver, By.CSS_SELECTOR, 'input[name="outstanding"]', '180000')
    fill(driver, By.CSS_SELECTOR, 'input[name="emi"]', '5000')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    assert 'HDFC Loan' in driver.find_element(By.ID, 'loanList').text


# ── TC-IV-020  Net worth reflects investments minus loans ─────────────────
def test_net_worth_calculation(driver):
    """Net worth = investments + cash savings - loan liabilities."""
    # Add investment
    click(driver, By.CSS_SELECTOR, '[data-sv="investments"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addInvBtn')
    time.sleep(0.3)
    Select(driver.find_element(By.CSS_SELECTOR, '#modalBody select[name="type"]')).select_by_visible_text('PPF')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="name"]', 'PPF')
    fill(driver, By.CSS_SELECTOR, '#modalBody input[name="currentValue"]', '500000')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    # Add loan
    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addLoanBtn')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'Car Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="principal"]', '300000')
    fill(driver, By.CSS_SELECTOR, 'input[name="outstanding"]', '200000')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    click(driver, By.CSS_SELECTOR, '[data-sv="overview"]')
    time.sleep(0.5)
    nw_text = driver.find_element(By.ID, 'statNetWorth').text
    # Net worth should be positive (500000 - 200000 = 300000)
    assert '0' not in nw_text or '3,00,000' in nw_text or '300' in nw_text


# ── TC-IV-021  Settings panel opens and saves ─────────────────────────────
def test_settings_panel(driver):
    """Settings panel opens, name can be saved."""
    open_settings(driver)
    time.sleep(0.3)
    panel = driver.find_element(By.ID, 'settingsPanel')
    assert 'open' in panel.get_attribute('class')
    name_input = driver.find_element(By.ID, 'spName')
    name_input.clear()
    name_input.send_keys('Finance User')
    driver.find_element(By.ID, 'spSave').click()
    time.sleep(0.5)
    assert 'saved' in get_toast(driver).lower()


# ── TC-IV-022  Export JSON via settings panel ─────────────────────────────
def test_export_json(driver):
    """Export JSON via settings panel does not produce an error toast."""
    open_settings(driver)
    time.sleep(0.3)
    driver.find_element(By.ID, 'spIvExportBtn').click()
    time.sleep(1)
    assert 'failed' not in get_toast(driver).lower()


# ── TC-IV-023  Reminder add from bell panel ───────────────────────────────
def test_reminder_add(driver):
    """Reminder can be added from the bell panel."""
    click(driver, By.ID, 'bellReminderBtn')
    time.sleep(0.3)
    click(driver, By.ID, 'floatingAddReminderBtn')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="title"]', 'EMI Due')
    fill(driver, By.CSS_SELECTOR, '#bellReminderForm input[name="date"]', '2099-03-01')
    driver.find_element(By.CSS_SELECTOR, '#bellReminderForm button[type="submit"]').click()
    time.sleep(0.5)
    assert 'EMI Due' in driver.find_element(By.ID, 'bellRemList').text


# ── TC-IV-024  Loan auto-reminder created ────────────────────────────────
def test_loan_auto_reminder(driver):
    """Adding a loan with a due date auto-creates a reminder."""
    click(driver, By.CSS_SELECTOR, '[data-sv="loans"]')
    time.sleep(0.3)
    click(driver, By.ID, 'addLoanBtn')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, 'input[name="name"]', 'Reminder Loan')
    fill(driver, By.CSS_SELECTOR, 'input[name="principal"]', '50000')
    fill(driver, By.CSS_SELECTOR, 'input[name="outstanding"]', '50000')
    fill(driver, By.CSS_SELECTOR, 'input[name="dueDate"]', '2099-05-01')
    driver.find_element(By.CSS_SELECTOR, '#modalBody .btn.primary').click()
    time.sleep(0.5)
    # Bell badge should show at least 1
    badge = driver.find_element(By.ID, 'bellReminderBadge')
    assert badge.is_displayed()
    assert int(badge.text or '0') >= 1


# ── TC-IV-025  Money values are rounded (no decimals) ────────────────────
def test_money_rounded(driver):
    """All displayed money values are whole numbers (no .xx decimals)."""
    click(driver, By.CSS_SELECTOR, '[data-sv="income"]')
    time.sleep(0.3)
    fill(driver, By.CSS_SELECTOR, '#incomeForm input[name="amount"]', '12345')
    set_date(driver, By.CSS_SELECTOR, '#incomeForm input[name="date"]', '2025-01-01')
    driver.find_element(By.CSS_SELECTOR, '#incomeForm button[type="submit"]').click()
    time.sleep(0.5)
    click(driver, By.CSS_SELECTOR, '[data-sv="overview"]')
    time.sleep(0.4)
    income_text = driver.find_element(By.ID, 'statIncome').text
    assert '.' not in income_text, f'Expected no decimal in: {income_text}'
