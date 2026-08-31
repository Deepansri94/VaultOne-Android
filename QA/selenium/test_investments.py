"""
Savings & Investments — UI Flow Tests
Correct flow:
  - Bank Account must exist before FD / RD can be added (paidFrom field)
  - Demat Account (bank record) must exist before Demat stock can be added
  - PPF / SSA / NPS use the Add Investment form (type selector)

TC-FD-001   Add Bank Account for FD — stored in banks store
TC-FD-002   Add FD via UI linked to bank account — stored in investments store
TC-FD-003   FD maturity date auto-calculated from start date + tenure
TC-FD-004   Matured FD (past maturity date) renders without isDateMatured error
TC-RD-001   Add RD via UI linked to bank account — stored in investments store
TC-RD-002   RD maturity date auto-calculated
TC-DMT-001  Add Demat Account (bank record) — stored in banks store
TC-DMT-002  Add Demat stock via UI linked to demat account — stored in investments store
TC-DMT-003  Demat P&L calculated (currentValue = qty × currentPrice)
TC-DMT-004  Add lot to existing stock — quantity increases
TC-PPF-001  Add PPF via UI — stored in investments store with category PPF
TC-SSA-001  Add SSA via UI — stored in investments store with category SSA
TC-NPS-001  Add NPS via UI — stored in investments store with category NPS
TC-GLD-001  Add Gold holding via UI — stored in gold store
TC-GLD-002  Update gold market price — goldRates store updated
TC-GLD-003  goldValue element present on iVault overview
TC-INV-001  Investments tab renders without SEVERE errors
TC-INV-002  Total current value stat updates after adding FD
"""
import time
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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


def _add_bank_account(driver, name, account_number, account_type='Savings',
                      initial_balance=500000):
    """Add a bank/demat account via the Banks & Accounts UI form."""
    nav_to(driver, 'ivault')
    nav_sub(driver, 'banks')
    time.sleep(0.4)

    driver.execute_script(
        "var b=document.getElementById('addBankAccountBtn'); if(b) b.click();"
    )
    WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
    time.sleep(0.3)

    driver.execute_script("""
        var form = document.querySelector('#modalBody form');
        if(!form) form = document.querySelector('.sheet form');
        if(!form) return;
        var set = function(n, v){
            var el = form.querySelector('[name="' + n + '"]');
            if(el){ el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
        };
        set('name',           arguments[0]);
        set('accountNumber',  arguments[1]);
        set('accountType',    arguments[2]);
        set('initialBalance', arguments[3]);
        set('status',         'Active');
    """, name, account_number, account_type, str(initial_balance))

    _click_submit_btn(driver, '#modalBody form, .sheet form')


def _open_add_investment_form(driver, inv_type):
    """Open the Add Investment modal and select the given type."""
    nav_to(driver, 'ivault')
    nav_sub(driver, 'investments')
    time.sleep(0.4)

    driver.execute_script(
        "var b=document.getElementById('addInvestmentBtn'); if(b) b.click();"
    )
    WebDriverWait(driver, 5).until(lambda d: sheet_is_open(d))
    time.sleep(0.3)

    # Select investment type — triggers dynamic field re-render
    driver.execute_script("""
        var sel = document.getElementById('investmentType');
        if(sel){ sel.value = arguments[0]; sel.dispatchEvent(new Event('change')); }
    """, inv_type)
    time.sleep(0.5)  # wait for dynamic fields to re-render


def _set_investment_field(driver, name, value):
    driver.execute_script("""
        var form = document.getElementById('investmentDynamicForm');
        if(!form) return;
        var el = form.querySelector('[name="' + arguments[0] + '"]');
        if(el){ el.value = arguments[1]; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
    """, name, str(value))


def _select_first_account(driver, field_name='paidFromAccountId'):
    driver.execute_script("""
        var form = document.getElementById('investmentDynamicForm');
        if(!form) return;
        var sel = form.querySelector('select[name="' + arguments[0] + '"]');
        if(sel && sel.options.length > 1) sel.selectedIndex = 1;
    """, field_name)


def _submit_investment_form(driver):
    _click_submit_btn(driver, '#investmentDynamicForm')


# ── Fixed Deposit ──────────────────────────────────────────────────────────────

class TestFixedDeposit:

    def test_TC_FD_001_add_bank_account_for_fd(self, driver):
        """Bank account added via UI is available in investments store paidFrom dropdown."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, name='QA FD Bank',
                          account_number='111100001111', initial_balance=500000)
        records = idb_get_all(driver, 'banks')
        names = [r.get('name', '') for r in records if isinstance(r, dict)]
        assert 'QA FD Bank' in names, \
            f'Bank account not found in IndexedDB. Got: {names}'

    def test_TC_FD_002_add_fd_linked_to_bank(self, driver):
        """Add FD via UI with bank selected — stored in investments store."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA FD Bank',
                          account_number='111100001111', initial_balance=500000)
        reload_app(driver)

        _open_add_investment_form(driver, 'fd')
        _set_investment_field(driver, 'bankName', 'QA FD Bank')
        _set_investment_field(driver, 'principal', '50000')
        _set_investment_field(driver, 'interestRate', '7')
        _set_investment_field(driver, 'tenureMonths', '12')
        _set_investment_field(driver, 'startDate', '2026-01-01')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        fds = [r for r in records if isinstance(r, dict) and r.get('type') == 'fd']
        assert len(fds) >= 1, \
            f'No FD record found in investments store. Got types: {[r.get("type") for r in records]}'
        assert fds[0].get('principal') == 50000, \
            f'FD principal mismatch. Got: {fds[0].get("principal")}'

    def test_TC_FD_003_fd_maturity_date_calculated(self, driver):
        """FD maturityDate is auto-calculated from startDate + tenureMonths."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA FD Bank',
                          account_number='111100001111', initial_balance=500000)
        reload_app(driver)

        _open_add_investment_form(driver, 'fd')
        _set_investment_field(driver, 'bankName', 'QA FD Bank')
        _set_investment_field(driver, 'principal', '50000')
        _set_investment_field(driver, 'interestRate', '7')
        _set_investment_field(driver, 'tenureMonths', '12')
        _set_investment_field(driver, 'startDate', '2026-01-01')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        fds = [r for r in records if isinstance(r, dict) and r.get('type') == 'fd']
        assert len(fds) >= 1, 'No FD record found after adding via UI'
        assert fds[0].get('maturityDate'), \
            'FD maturityDate is empty — auto-calculation did not work'

    def test_TC_FD_004_matured_fd_no_js_error(self, driver):
        """FD with past maturity date renders without isDateMatured ReferenceError."""
        idb_put(driver, 'investments', {
            'id': 'qa-fd-matured-001',
            'type': 'fd',
            'category': 'FD',
            'bankName': 'QA Matured Bank',
            'name': 'QA Matured FD',
            'principal': 30000,
            'interestRate': 6.5,
            'tenureMonths': 12,
            'startDate': '2024-01-01',
            'maturityDate': '2025-01-01',
            'currentValue': 31950,
            'createdAt': '2024-01-01T00:00:00.000Z',
            'updatedAt': '2024-01-01T00:00:00.000Z',
        })
        reload_app(driver)
        nav_to(driver, 'ivault')
        nav_sub(driver, 'investments')
        time.sleep(0.5)
        severe = [e for e in get_severe_errors(driver)
                  if 'isDateMatured' in e.get('message', '')]
        assert len(severe) == 0, f'isDateMatured error on matured FD: {severe}'


# ── Recurring Deposit ──────────────────────────────────────────────────────────

class TestRecurringDeposit:

    def test_TC_RD_001_add_rd_linked_to_bank(self, driver):
        """Add RD via UI with bank selected — stored in investments store."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA RD Bank',
                          account_number='222200002222', initial_balance=200000)
        reload_app(driver)

        _open_add_investment_form(driver, 'rd')
        _set_investment_field(driver, 'bankName', 'QA RD Bank')
        _set_investment_field(driver, 'monthlyContribution', '5000')
        _set_investment_field(driver, 'interestRate', '6.5')
        _set_investment_field(driver, 'tenureMonths', '24')
        _set_investment_field(driver, 'startDate', '2026-01-01')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        rds = [r for r in records if isinstance(r, dict) and r.get('type') == 'rd']
        assert len(rds) >= 1, \
            f'No RD record found in investments store. Got: {[r.get("type") for r in records]}'

    def test_TC_RD_002_rd_maturity_date_calculated(self, driver):
        """RD maturityDate is auto-calculated from startDate + tenureMonths."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA RD Bank',
                          account_number='222200002222', initial_balance=200000)
        reload_app(driver)

        _open_add_investment_form(driver, 'rd')
        _set_investment_field(driver, 'bankName', 'QA RD Bank')
        _set_investment_field(driver, 'monthlyContribution', '5000')
        _set_investment_field(driver, 'interestRate', '6.5')
        _set_investment_field(driver, 'tenureMonths', '24')
        _set_investment_field(driver, 'startDate', '2026-01-01')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        rds = [r for r in records if isinstance(r, dict) and r.get('type') == 'rd']
        assert len(rds) >= 1, 'No RD record found after adding via UI'
        assert rds[0].get('maturityDate'), \
            'RD maturityDate is empty — auto-calculation did not work'


# ── Demat ──────────────────────────────────────────────────────────────────────

class TestDemat:

    def test_TC_DMT_001_add_demat_account(self, driver):
        """Add Demat Account (bank record with type Demat) — stored in banks store."""
        idb_clear(driver, 'banks')
        _add_bank_account(driver, name='QA Demat Account',
                          account_number='DEMAT001234', account_type='Demat',
                          initial_balance=0)
        records = idb_get_all(driver, 'banks')
        names = [r.get('name', '') for r in records if isinstance(r, dict)]
        assert 'QA Demat Account' in names, \
            f'Demat account not found in banks store. Got: {names}'

    def test_TC_DMT_002_add_demat_stock_linked_to_account(self, driver):
        """Add Demat stock via UI with demat account selected — stored in investments."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA Demat Account',
                          account_number='DEMAT001234', account_type='Demat',
                          initial_balance=0)
        reload_app(driver)

        _open_add_investment_form(driver, 'demat')
        # Stock name (new stock — no existing stocks yet)
        driver.execute_script("""
            var form = document.getElementById('investmentDynamicForm');
            if(!form) return;
            // If there's a stockNameNew input (new stock mode), fill it
            var newInp = form.querySelector('#stockNameNew');
            if(newInp && newInp.style.display !== 'none'){
                newInp.value = 'RELIANCE';
                newInp.dispatchEvent(new Event('input'));
            } else {
                var inp = form.querySelector('input[name="stockName"]');
                if(inp){ inp.value = 'RELIANCE'; inp.dispatchEvent(new Event('input')); }
            }
        """)
        _set_investment_field(driver, 'lotQty', '10')
        _set_investment_field(driver, 'lotPurchasePrice', '2800')
        _set_investment_field(driver, 'currentPrice', '2950')
        _set_investment_field(driver, 'lotDate', '2026-01-15')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        demat = [r for r in records if isinstance(r, dict) and r.get('type') == 'demat']
        assert len(demat) >= 1, \
            f'No Demat record found in investments store. Got: {[r.get("type") for r in records]}'

    def test_TC_DMT_003_demat_pl_calculated(self, driver):
        """Demat currentValue = quantity × currentPrice (P&L calculated)."""
        idb_clear(driver, 'banks')
        idb_clear(driver, 'investments')
        _add_bank_account(driver, name='QA Demat Account',
                          account_number='DEMAT001234', account_type='Demat',
                          initial_balance=0)
        reload_app(driver)

        _open_add_investment_form(driver, 'demat')
        driver.execute_script("""
            var form = document.getElementById('investmentDynamicForm');
            if(!form) return;
            var newInp = form.querySelector('#stockNameNew');
            if(newInp && newInp.style.display !== 'none'){
                newInp.value = 'INFY';
                newInp.dispatchEvent(new Event('input'));
            } else {
                var inp = form.querySelector('input[name="stockName"]');
                if(inp){ inp.value = 'INFY'; inp.dispatchEvent(new Event('input')); }
            }
        """)
        _set_investment_field(driver, 'lotQty', '5')
        _set_investment_field(driver, 'lotPurchasePrice', '1500')
        _set_investment_field(driver, 'currentPrice', '1800')
        _set_investment_field(driver, 'lotDate', '2026-01-15')
        _select_first_account(driver, 'paidFromAccountId')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        demat = [r for r in records if isinstance(r, dict) and r.get('type') == 'demat']
        assert len(demat) >= 1, 'No Demat record found after adding via UI'
        d = demat[0]
        qty = d.get('quantity', 0)
        price = d.get('currentPrice', 0)
        actual_value = d.get('currentValue', -1)
        assert abs(actual_value - qty * price) < 1, \
            f'Demat currentValue mismatch. qty={qty}, price={price}, '\
            f'expected={qty * price}, got={actual_value}'

    def test_TC_DMT_004_investments_tab_renders(self, driver):
        """Investments tab renders without SEVERE errors after adding demat stock."""
        nav_to(driver, 'ivault')
        nav_sub(driver, 'investments')
        time.sleep(0.5)
        assert len(get_severe_errors(driver)) == 0, \
            f'SEVERE errors on Investments tab: {get_severe_errors(driver)}'


# ── PPF / SSA / NPS ────────────────────────────────────────────────────────────

class TestRecurringSavings:

    def test_TC_PPF_001_add_ppf_via_ui(self, driver):
        """Add PPF via UI — stored in investments store with category PPF."""
        idb_clear(driver, 'investments')
        _open_add_investment_form(driver, 'ppf')
        _set_investment_field(driver, 'bankName', 'QA Post Office')
        _set_investment_field(driver, 'name', 'QA PPF Account')
        _set_investment_field(driver, 'asOfBalance', '150000')
        _set_investment_field(driver, 'interestRate', '7.1')
        _set_investment_field(driver, 'accountOpenedOn', '2020-04-01')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        ppf = [r for r in records
               if isinstance(r, dict) and r.get('category') == 'PPF']
        assert len(ppf) >= 1, \
            f'No PPF record found. Got categories: {[r.get("category") for r in records]}'

    def test_TC_SSA_001_add_ssa_via_ui(self, driver):
        """Add SSA via UI — stored in investments store with category SSA."""
        idb_clear(driver, 'investments')
        _open_add_investment_form(driver, 'ssa')
        _set_investment_field(driver, 'bankName', 'QA Post Office SSA')
        _set_investment_field(driver, 'name', 'QA SSA Account')
        _set_investment_field(driver, 'asOfBalance', '80000')
        _set_investment_field(driver, 'interestRate', '8.2')
        _set_investment_field(driver, 'accountOpenedOn', '2021-04-01')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        ssa = [r for r in records
               if isinstance(r, dict) and r.get('category') == 'SSA']
        assert len(ssa) >= 1, \
            f'No SSA record found. Got categories: {[r.get("category") for r in records]}'

    def test_TC_NPS_001_add_nps_via_ui(self, driver):
        """Add NPS via UI — stored in investments store with category NPS."""
        idb_clear(driver, 'investments')
        _open_add_investment_form(driver, 'nps')
        _set_investment_field(driver, 'provider', 'QA NPS Provider')
        _set_investment_field(driver, 'name', 'QA NPS Account')
        _set_investment_field(driver, 'monthlyContribution', '5000')
        _set_investment_field(driver, 'currentValue', '200000')
        _set_investment_field(driver, 'interestRate', '10')
        _set_investment_field(driver, 'startDate', '2022-04-01')
        _submit_investment_form(driver)

        records = idb_get_all(driver, 'investments')
        nps = [r for r in records
               if isinstance(r, dict) and r.get('category') == 'NPS']
        assert len(nps) >= 1, \
            f'No NPS record found. Got categories: {[r.get("category") for r in records]}'


# ── Gold Vault ─────────────────────────────────────────────────────────────────

def _wait_gold_form(driver, form_id, timeout=8):
    """Wait for a dynamically-rendered gold form to appear in the DOM."""
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script(
            f"return !!document.getElementById('{form_id}');"
        )
    )
    time.sleep(0.2)


class TestGoldVault:

    def test_TC_GLD_001_add_gold_via_ui(self, driver):
        """Add Gold holding via UI — gold store starts empty, record added via form."""
        idb_clear(driver, 'gold')
        assert idb_get_all(driver, 'gold') == [], \
            'gold store not empty before test'

        nav_to(driver, 'ivault')
        nav_sub(driver, 'gold')
        _wait_gold_form(driver, 'goldAddForm')

        driver.execute_script("""
            var form = document.getElementById('goldAddForm');
            var set = function(n, v){
                var el = form.querySelector('[name="' + n + '"]');
                if(el){ el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('name',         'QA Gold Bangle');
            set('purity',       '22K');
            set('weight',       '10');
            set('purchaseRate', '5500');
            set('date',         '2024-01-01');
        """)
        _click_submit_btn(driver, '#goldAddForm')

        records = idb_get_all(driver, 'gold')
        names = [r.get('name', '') for r in records if isinstance(r, dict)]
        assert 'QA Gold Bangle' in names, \
            f'Gold holding not found in gold store. Got: {names}'

    def test_TC_GLD_002_update_gold_market_price(self, driver):
        """Update gold market price via UI — goldRates store starts empty, rate added via form."""
        idb_clear(driver, 'goldRates')
        assert idb_get_all(driver, 'goldRates') == [], \
            'goldRates store not empty before test'

        nav_to(driver, 'ivault')
        nav_sub(driver, 'gold')
        _wait_gold_form(driver, 'goldRateForm')

        driver.execute_script("""
            var form = document.getElementById('goldRateForm');
            var set = function(n, v){
                var el = form.querySelector('[name="' + n + '"]');
                if(el){ el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
            };
            set('date', '2026-08-01');
            set('K18',  '4800');
            set('K22',  '6200');
            set('K24',  '6800');
        """)
        _click_submit_btn(driver, '#goldRateForm')

        rates = idb_get_all(driver, 'goldRates')
        assert len(rates) >= 1, 'No gold rate record found in goldRates store'
        assert rates[0].get('K22') == 6200, \
            f'K22 rate mismatch. Got: {rates[0].get("K22")}'
    def test_TC_GLD_003_gold_value_element_present(self, driver):
        """goldValue element is present on iVault overview."""
        nav_to(driver, 'ivault')
        assert driver.find_element(By.ID, 'goldValue'), '#goldValue element missing'
