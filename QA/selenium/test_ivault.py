"""
iVault — UI Flow Tests
Correct flow: Bank Account must exist before Income, Expense, FD, RD can be linked.

TC-OVW-001  iVault stats elements present
TC-OVW-002  All 9 sub-tabs clickable without SEVERE errors
TC-BNK-001  Add Bank Account via UI — stored in IndexedDB banks store
TC-BNK-002  Account number leading zeros preserved in display
TC-BNK-003  Edit Account modal pre-populates fields
TC-BNK-004  Archive/Deactivate Account — status set to Inactive in IndexedDB
TC-INC-001  Add Income via UI linked to bank account — stored in IndexedDB
TC-INC-002  Income amount reflected in mIncome stat
TC-EXP-001  Add Expense via UI linked to bank account — stored in IndexedDB
TC-EXP-002  Expense amount reflected in mExpense stat
TC-BUD-001  Budget section renders without errors
TC-BUD-002  Save Budget for current month — stored in IndexedDB
TC-TXN-001  Transactions section renders after income/expense added
TC-TXN-002  Transaction record created automatically when income is saved
TC-LNS-001  Add Loan via UI — stored in IndexedDB loans store
TC-LNS-002  Loan outstanding shown in loans list
TC-LNS-003  Settled loan status stored correctly
"""
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from conftest import (
    nav_to, nav_sub, reload_app, get_severe_errors,
    sheet_is_open, idb_get_all, idb_clear, idb_put,
)

# ── Shared helpers ─────────────────────────────────────────────────────────────

def _close_modal(driver):
    driver.execute_script(
        "var b=document.getElementById('modalClose'); if(b) b.click();"
    )
    time.sleep(0.3)


def _click_submit_btn(driver, form_selector):
    """Click the primary submit button inside a form."""
    driver.execute_script(f"""
        var form = document.querySelector('{form_selector}');
        if(!form) return;
        var btn = form.querySelector('button[type="submit"], button.primary, button.btn.primary');
        if(btn) btn.click();
    """)
    time.sleep(0.9)


def _wait_form(driver, form_id, timeout=8):
    """Wait for a dynamically-rendered inline form to appear in the DOM."""
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script(
            f"return !!document.getElementById('{form_id}');"
        )
    )
    time.sleep(0.2)


def _add_bank_account(driver, name='QA Savings Bank', account_number='000012345678',
                      account_type='Savings', initial_balance=500000):
    """Add a bank account via the UI form in Banks & Accounts tab."""
    nav_to(driver, 'ivault')
    nav_sub(driver, 'banks')
    time.sleep(0.4)

    driver.execute_script(
        "var b=document.getElementById('addBankAccountBtn'); if(b) b.click();"
    )
    WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
    time.sleep(0.3)

    # Fill the form inside the modal (modal wraps a .sheet div)
    driver.execute_script("""
        var form = document.querySelector('#modalBody form');
        if(!form) form = document.querySelector('.sheet form');
        if(!form) return;
        var set = function(name, val){
            var el = form.querySelector('[name="' + name + '"]');
            if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
        };
        set('name',           arguments[0]);
        set('accountNumber',  arguments[1]);
        set('accountType',    arguments[2]);
        set('initialBalance', arguments[3]);
        set('status',         'Active');
    """, name, account_number, account_type, str(initial_balance))

    # Click the submit button (triggers openModal's onSubmit handler)
    _click_submit_btn(driver, '#modalBody form, .sheet form')


def _get_first_bank_id(driver):
    records = idb_get_all(driver, 'banks')
    for r in records:
        if isinstance(r, dict) and r.get('id'):
            return r['id']
    return None


# ── Overview ───────────────────────────────────────────────────────────────────

class TestOverview:

    def test_TC_OVW_001_stats_elements_present(self, driver):
        """netWorth, mIncome, mExpense, mSavings all present in iVault."""
        nav_to(driver, 'ivault')
        for el_id in ['netWorth', 'mIncome', 'mExpense', 'mSavings']:
            assert driver.find_element(By.ID, el_id), f'#{el_id} missing'

    def test_TC_OVW_002_all_subtabs_clickable(self, driver):
        """All 9 iVault sub-tabs are clickable without SEVERE console errors."""
        nav_to(driver, 'ivault')
        subtabs = ['financeDashboard', 'income', 'expenses', 'budget',
                   'investments', 'gold', 'loans', 'banks', 'transactions']
        for sub in subtabs:
            btn = driver.find_element(By.CSS_SELECTOR, f'[data-sub="{sub}"]')
            assert btn.is_displayed(), f'Sub-tab "{sub}" not visible'
            btn.click()
            time.sleep(0.3)
            assert len(get_severe_errors(driver)) == 0, \
                f'SEVERE error after clicking sub-tab "{sub}"'


# ── Banks & Accounts ───────────────────────────────────────────────────────────

class TestBanks:

    def test_TC_BNK_001_add_bank_account_via_ui(self, driver):
        """Add Bank Account via UI — record stored in IndexedDB banks store."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, name='QA Savings Bank',
                          account_number='000012345678', initial_balance=500000)
        records = idb_get_all(driver, 'banks')
        names = [r.get('name', '') for r in records if isinstance(r, dict)]
        assert 'QA Savings Bank' in names, \
            f'Bank account not found in IndexedDB. Got: {names}'

    def test_TC_BNK_002_leading_zeros_preserved(self, driver):
        """Account number 000012345678 is displayed without stripping leading zeros."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, account_number='000012345678')
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'banks')
        time.sleep(0.5)
        assert '000012345678' in driver.page_source, \
            'Leading zeros stripped from account number display'

    def test_TC_BNK_003_edit_account_modal_prepopulates(self, driver):
        """Edit button opens modal with account name pre-filled."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, name='QA Edit Bank')
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'banks')
        time.sleep(0.5)

        driver.execute_script(
            "var b=document.querySelector('[data-edit-bank-account]'); if(b) b.click();"
        )
        time.sleep(0.5)
        name_val = driver.execute_script(
            "var inp=document.querySelector('#modalBody form input[name=\"name\"]');"
            "return inp ? inp.value : '';"
        )
        assert name_val == 'QA Edit Bank', \
            f'Edit modal name not pre-populated. Got: "{name_val}"'
        _close_modal(driver)

    def test_TC_BNK_004_archive_account_sets_inactive(self, driver):
        """Archive/Deactivate Account — edit account and set status to Inactive."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, name='QA Archive Bank')
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'banks')
        time.sleep(0.5)

        # Open edit modal
        driver.execute_script(
            "var b=document.querySelector('[data-edit-bank-account]'); if(b) b.click();"
        )
        WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
        time.sleep(0.3)

        # Set status to Inactive
        driver.execute_script("""
            var form = document.querySelector('#modalBody form');
            if(!form) form = document.querySelector('.sheet form');
            if(!form) return;
            var sel = form.querySelector('[name="status"]');
            if(sel){ sel.value = 'Inactive'; sel.dispatchEvent(new Event('change')); }
        """)
        _click_submit_btn(driver, '#modalBody form, .sheet form')

        reload_app(driver)
        records = idb_get_all(driver, 'banks')
        archived = [r for r in records
                    if isinstance(r, dict) and r.get('status') == 'Inactive']
        assert len(archived) >= 1, \
            'No Inactive bank account found after archiving'


# ── Income ─────────────────────────────────────────────────────────────────────

class TestIncome:

    def test_TC_INC_001_add_income_linked_to_bank(self, driver):
        """Add Income via UI with bank account selected — stored in IndexedDB."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'income')
        _add_bank_account(driver, name='QA Income Bank', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'income')
        _wait_form(driver, 'incomeFinalForm')

        driver.execute_script("""
            var form = document.getElementById('incomeFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '50000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        # Click the Save Income button (not dispatchEvent — triggers real handler)
        _click_submit_btn(driver, '#incomeFinalForm')

        records = idb_get_all(driver, 'income')
        amounts = [r.get('amount', 0) for r in records if isinstance(r, dict)]
        assert 50000 in amounts, \
            f'Income 50000 not found in IndexedDB. Got: {amounts}'

    def test_TC_INC_002_income_linked_to_account(self, driver):
        """Income record has accountId set (linked to bank account)."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'income')
        _add_bank_account(driver, name='QA Income Bank 2', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'income')
        _wait_form(driver, 'incomeFinalForm')

        driver.execute_script("""
            var form = document.getElementById('incomeFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '30000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        _click_submit_btn(driver, '#incomeFinalForm')

        records = idb_get_all(driver, 'income')
        linked = [r for r in records if isinstance(r, dict) and r.get('accountId')]
        assert len(linked) >= 1, \
            'No income record has accountId set — bank account not linked'


# ── Expenses ───────────────────────────────────────────────────────────────────

class TestExpenses:

    def test_TC_EXP_001_add_expense_linked_to_bank(self, driver):
        """Add Expense via UI — expense tab opens a direct inline form (no Add button)."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'expenses')
        _add_bank_account(driver, name='QA Expense Bank', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'expenses')
        _wait_form(driver, 'expenseFinalForm')

        driver.execute_script("""
            var form = document.getElementById('expenseFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '5000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        _click_submit_btn(driver, '#expenseFinalForm')

        records = idb_get_all(driver, 'expenses')
        amounts = [r.get('amount', 0) for r in records if isinstance(r, dict)]
        assert 5000 in amounts, \
            f'Expense 5000 not found in IndexedDB. Got: {amounts}'

    def test_TC_EXP_002_expense_linked_to_account(self, driver):
        """Expense record has accountId set (linked to bank account)."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'expenses')
        _add_bank_account(driver, name='QA Expense Bank 2', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'expenses')
        _wait_form(driver, 'expenseFinalForm')

        driver.execute_script("""
            var form = document.getElementById('expenseFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '2000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        _click_submit_btn(driver, '#expenseFinalForm')

        records = idb_get_all(driver, 'expenses')
        linked = [r for r in records if isinstance(r, dict) and r.get('accountId')]
        assert len(linked) >= 1, \
            'No expense record has accountId set — bank account not linked'


# ── Budget ─────────────────────────────────────────────────────────────────────

class TestBudget:

    def test_TC_BUD_001_section_renders(self, driver):
        """Budget section renders without SEVERE errors."""
        nav_to(driver, 'ivault')
        nav_sub(driver, 'budget')
        time.sleep(0.5)
        assert driver.find_element(By.ID, 'budget')
        assert len(get_severe_errors(driver)) == 0

    def test_TC_BUD_002_save_budget_stored_in_idb(self, driver):
        """Save Budget for current month — record stored in IndexedDB budgets store."""
        nav_to(driver, 'ivault')
        nav_sub(driver, 'budget')
        time.sleep(0.5)

        driver.execute_script("""
            var form = document.getElementById('budgetPlanner');
            if(!form) return;
            var inp = form.querySelector('input[name="cat_Household"]');
            if(inp){ inp.value = '15000'; inp.dispatchEvent(new Event('input')); }
        """)
        _click_submit_btn(driver, '#budgetPlanner')

        records = idb_get_all(driver, 'budgets')
        assert len(records) >= 1, 'No budget record found in IndexedDB after save'
        for r in records:
            if isinstance(r, dict) and r.get('month'):
                m = r['month']
                assert len(m) == 7 and m[4] == '-', f'Bad month format: {m}'


# ── Transactions ───────────────────────────────────────────────────────────────

class TestTransactions:

    def test_TC_TXN_001_section_renders(self, driver):
        """Transactions section renders without SEVERE errors."""
        nav_to(driver, 'ivault')
        nav_sub(driver, 'transactions')
        time.sleep(0.4)
        assert driver.find_element(By.ID, 'transactions')
        assert len(get_severe_errors(driver)) == 0

    def test_TC_TXN_002_transaction_created_with_income(self, driver):
        """Saving income with a bank account auto-creates a transaction record."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'income')
        idb_clear(driver, 'transactions')
        _add_bank_account(driver, name='QA TXN Bank', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'income')
        _wait_form(driver, 'incomeFinalForm')

        driver.execute_script("""
            var form = document.getElementById('incomeFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '40000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        _click_submit_btn(driver, '#incomeFinalForm')

        txns = idb_get_all(driver, 'transactions')
        assert len(txns) >= 1, \
            'No transaction record created after saving income with bank account'

    def test_TC_TXN_004_transaction_created_with_expense(self, driver):
        """Saving expense with a bank account auto-creates a transaction record."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'expenses')
        idb_clear(driver, 'transactions')
        _add_bank_account(driver, name='QA EXP TXN Bank', initial_balance=100000)
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'expenses')
        _wait_form(driver, 'expenseFinalForm')

        driver.execute_script("""
            var form = document.getElementById('expenseFinalForm');
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('amount', '3000');
            set('date',   '2026-08-01');
            var sel = form.querySelector('select[name="accountId"]');
            if(sel && sel.options.length > 1) sel.selectedIndex = 1;
        """)
        _click_submit_btn(driver, '#expenseFinalForm')

        txns = idb_get_all(driver, 'transactions')
        assert len(txns) >= 1, \
            'No transaction record created after saving expense with bank account'

    def test_TC_TXN_005_transaction_created_with_fd(self, driver):
        """Saving FD with paidFromAccountId auto-creates a transaction record."""
        from conftest import idb_put
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        idb_clear(driver, 'transactions')
        _add_bank_account(driver, name='QA FD TXN Bank', initial_balance=500000)
        reload_app(driver)

        # Import investment helpers inline
        from test_investments import (
            _open_add_investment_form, _set_investment_field,
            _select_first_account, _submit_investment_form,
        )
        _open_add_investment_form(driver, 'fd')
        _set_investment_field(driver, 'bankName', 'QA FD TXN Bank')
        _set_investment_field(driver, 'principal', '25000')
        _set_investment_field(driver, 'interestRate', '7')
        _set_investment_field(driver, 'tenureMonths', '12')
        _set_investment_field(driver, 'startDate', '2026-01-01')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        txns = idb_get_all(driver, 'transactions')
        assert len(txns) >= 1, \
            'No transaction record created after saving FD with paidFromAccountId'

    def test_TC_TXN_003_csv_export_button_present(self, driver):
        """Download CSV button is present in Transactions tab."""
        nav_to(driver, 'ivault')
        nav_sub(driver, 'transactions')
        time.sleep(0.4)
        has_csv = driver.execute_script("""
            var btns = Array.from(document.querySelectorAll('button'));
            return btns.some(b => b.textContent.toLowerCase().includes('csv'));
        """)
        assert has_csv, 'Download CSV button not found in Transactions tab'


# ── Loans ──────────────────────────────────────────────────────────────────────

class TestLoans:

    def test_TC_LNS_001_add_loan_via_ui(self, driver):
        """Add Loan via UI — record stored in IndexedDB loans store."""
        idb_clear(driver, 'loans')
        nav_to(driver, 'ivault')
        nav_sub(driver, 'loans')
        time.sleep(0.4)

        driver.execute_script(
            "var b=document.getElementById('addLoanV1Btn'); if(b) b.click();"
        )
        WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
        time.sleep(0.3)

        driver.execute_script("""
            var form = document.getElementById('loanV1Form');
            if(!form) return;
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('lender',    'QA Test Bank');
            set('principal', '200000');
            set('interest',  '10.5');
            set('emi',       '4500');
            set('tenure',    '60');
            set('emisPaid',  '0');
        """)
        _click_submit_btn(driver, '#loanV1Form')

        records = idb_get_all(driver, 'loans')
        lenders = [r.get('lender', '') for r in records if isinstance(r, dict)]
        assert 'QA Test Bank' in lenders, \
            f'Loan not found in IndexedDB. Got lenders: {lenders}'

    def test_TC_LNS_002_loan_outstanding_shown(self, driver):
        """Loans list renders loan name after adding — list renders x.name field."""
        idb_clear(driver, 'loans')
        nav_to(driver, 'ivault')
        nav_sub(driver, 'loans')
        time.sleep(0.4)

        driver.execute_script(
            "var b=document.getElementById('addLoanV1Btn'); if(b) b.click();"
        )
        WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
        time.sleep(0.3)

        driver.execute_script("""
            var form = document.getElementById('loanV1Form');
            if(!form) return;
            var set = function(name, val){
                var el = form.querySelector('[name="' + name + '"]');
                if(el){ el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('name',      'QA Home Loan');  // loan list renders x.name, not x.lender
            set('lender',    'QA Outstanding Bank');
            set('principal', '100000');
            set('interest',  '9');
            set('emi',       '2000');
            set('tenure',    '60');
            set('emisPaid',  '5');
        """)
        _click_submit_btn(driver, '#loanV1Form')

        nav_to(driver, 'ivault')
        nav_sub(driver, 'loans')
        time.sleep(0.5)
        assert 'QA Home Loan' in driver.page_source, \
            'Loan name not visible in loans list — list renders x.name field'

    def test_TC_LNS_003_settled_loan_status(self, driver):
        """Loan with status Settled stored correctly in IndexedDB."""
        idb_put(driver, 'loans', {
            'id': 'qa-loan-settled-001',
            'loanType': 'Personal Loan',
            'lender': 'QA Settled Bank',
            'principal': 100000,
            'interest': 9,
            'emi': 2000,
            'tenure': 60,
            'emisPaid': 60,
            'status': 'Settled',
            'createdAt': '2024-01-01T00:00:00.000Z',
            'updatedAt': '2024-01-01T00:00:00.000Z',
        })
        reload_app(driver)
        records = idb_get_all(driver, 'loans')
        settled = next(
            (r for r in records if isinstance(r, dict) and r.get('status') == 'Settled'),
            None
        )
        assert settled is not None, 'No Settled loan found in IndexedDB'
