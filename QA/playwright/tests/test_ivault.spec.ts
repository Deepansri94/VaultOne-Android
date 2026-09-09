import { test, expect, Page } from '@playwright/test';
import { URLS, clearIDB, getToast, setDate, autoConfirm } from './helpers';

// ── helpers ──────────────────────────────────────────────────────────────────
async function waitModal(page: Page) {
  await page.locator('#modal').waitFor({ state: 'visible', timeout: 5000 });
  await expect(page.locator('#modal')).toHaveClass(/open/);
}
async function waitModalClosed(page: Page) {
  await expect(page.locator('#modal')).not.toHaveClass(/open/, { timeout: 5000 });
}
async function submitModal(page: Page) {
  await page.locator('#modalBody .btn.primary').click();
  await waitModalClosed(page);
}
// Ensure a collapsible invest section is open before interacting with its buttons
async function openInvSection(page: Page, key: string) {
  const body = page.locator(`#inv-sec-body-${key}`);
  const isHidden = await body.evaluate((el: HTMLElement) => el.style.display === 'none');
  if (isHidden) await page.locator(`[data-inv-sec="${key}"]`).click();
  await expect(body).toBeVisible();
}
// Click the seg-btn that lives inside the currently active sub-view (others are in display:none parents)
async function clickSegBtn(page: Page, seg: string, group: string) {
  await page.evaluate(({ seg, group }) => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>(
      `[data-inner-seg="${seg}"][data-group="${group}"]`
    )).find(el => el.closest('.sub-view')?.classList.contains('active'));
    btn?.click();
  }, { seg, group });
}
async function goMoney(page: Page, seg: string) {
  await page.locator('[data-sv="money"]').click();
  if (seg !== 'income') await clickSegBtn(page, seg, 'money');
}
async function goInvest(page: Page, seg: string) {
  await page.locator('[data-sv="investloans"]').click();
  if (seg !== 'investments') await clickSegBtn(page, seg, 'investloans');
}

// ── setup ─────────────────────────────────────────────────────────────────────
test.beforeEach(async ({ page }) => {
  await page.goto(URLS.ivault);
  await clearIDB(page, 'iVaultDB');
  await page.goto(URLS.ivault);
  await page.waitForLoadState('domcontentloaded');
});

// TC-IV-001
test('iVault page loads', async ({ page }) => {
  await expect(page).toHaveTitle(/iVault/);
  await expect(page.locator('h1')).toContainText('iVault');
});

// TC-IV-002
test('overview stats start at zero', async ({ page }) => {
  for (const id of ['statNetWorth', 'statIncome', 'statExpense', 'statSavings']) {
    await expect(page.locator(`#${id}`)).toContainText('0');
  }
});

// TC-IV-003: outer nav tabs
test('outer nav tabs switch sub-views', async ({ page }) => {
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#sv-overview')).toHaveClass(/active/);

  await page.locator('[data-sv="money"]').click();
  await expect(page.locator('#sv-income')).toHaveClass(/active/);

  await page.locator('[data-sv="investloans"]').click();
  await expect(page.locator('#sv-investments')).toHaveClass(/active/);

  await page.locator('[data-sv="transactions"]').click();
  await expect(page.locator('#sv-transactions')).toHaveClass(/active/);
});

// TC-IV-003b: inner seg pills — money group
test('inner seg pills switch money sub-views', async ({ page }) => {
  await page.locator('[data-sv="money"]').click();
  await clickSegBtn(page, 'expenses', 'money');
  await expect(page.locator('#sv-expenses')).toHaveClass(/active/);
  await clickSegBtn(page, 'budget', 'money');
  await expect(page.locator('#sv-budget')).toHaveClass(/active/);
  await clickSegBtn(page, 'income', 'money');
  await expect(page.locator('#sv-income')).toHaveClass(/active/);
});

// TC-IV-003c: inner seg pills — investloans group
test('inner seg pills switch investloans sub-views', async ({ page }) => {
  await page.locator('[data-sv="investloans"]').click();
  await clickSegBtn(page, 'loans', 'investloans');
  await expect(page.locator('#sv-loans')).toHaveClass(/active/);
  await clickSegBtn(page, 'demat', 'investloans');
  await expect(page.locator('#sv-demat')).toHaveClass(/active/);
  await clickSegBtn(page, 'nps', 'investloans');
  await expect(page.locator('#sv-nps')).toHaveClass(/active/);
  await clickSegBtn(page, 'investments', 'investloans');
  await expect(page.locator('#sv-investments')).toHaveClass(/active/);
});

// TC-IV-004
test('add income record', async ({ page }) => {
  await goMoney(page, 'income');
  await page.locator('#incomeForm select[name="type"]').selectOption({ label: 'Salary' });
  await page.locator('#incomeForm input[name="amount"]').fill('50000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-15');
  await page.locator('#incomeForm button[type="submit"]').click();
  await expect(page.locator('#incomeList')).toContainText('Salary');
  await expect(page.locator('#incomeList')).toContainText(/50,000|50000/);
});

test('income and expense histories keep entry order on the same date', async ({ page }) => {
  const entryDate = '2025-01-15';
  await goMoney(page, 'income');
  for (const [amount, note] of [['100', 'First income'], ['200', 'Second income']]) {
    await page.locator('#incomeForm input[name="amount"]').fill(amount);
    await setDate(page, '#incomeForm input[name="date"]', entryDate);
    await page.locator('#incomeForm input[name="note"]').fill(note);
    await page.locator('#incomeForm button[type="submit"]').click();
    await page.waitForTimeout(50);
  }
  await expect(page.locator('#incomeList tbody tr').nth(0)).toContainText('Second income');
  await expect(page.locator('#incomeList tbody tr').nth(1)).toContainText('First income');

  await clickSegBtn(page, 'expenses', 'money');
  for (const [amount, note] of [['300', 'First expense'], ['400', 'Second expense']]) {
    await page.locator('#expenseForm input[name="amount"]').fill(amount);
    await setDate(page, '#expenseForm input[name="date"]', entryDate);
    await page.locator('#expenseForm input[name="note"]').fill(note);
    await page.locator('#expenseForm button[type="submit"]').click();
    await page.waitForTimeout(50);
  }
  await expect(page.locator('#expenseList tbody tr').nth(0)).toContainText('Second expense');
  await expect(page.locator('#expenseList tbody tr').nth(1)).toContainText('First expense');
});

// TC-IV-005
test('income updates overview stat', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goMoney(page, 'income');
  await page.locator('#incomeForm input[name="amount"]').fill('30000');
  await setDate(page, '#incomeForm input[name="date"]', today);
  await page.locator('#incomeForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statIncome')).not.toContainText('₹0');
});

// TC-IV-006
test('delete income record', async ({ page }) => {
  await goMoney(page, 'income');
  await page.locator('#incomeForm input[name="amount"]').fill('1000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-02-01');
  await page.locator('#incomeForm button[type="submit"]').click();
  await expect(page.locator('#incomeList')).toContainText('1');
  await autoConfirm(page);
  await page.locator('[data-idel]').first().click({ force: true });
  await expect(page.locator('#incomeList')).toContainText('No income');
});

// TC-IV-016
test('money values have no decimal places', async ({ page }) => {
  await goMoney(page, 'income');
  await page.locator('#incomeForm input[name="amount"]').fill('12345');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-01');
  await page.locator('#incomeForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  const text = await page.locator('#statIncome').textContent();
  expect(text).not.toMatch(/\.\d{2}/);
});

// TC-IV-007
test('add expense with sub-category', async ({ page }) => {
  await goMoney(page, 'expenses');
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Household' });
  await expect(page.locator('#expSubcatSelect')).toBeVisible();
  await page.locator('#expSubcatSelect').selectOption({ label: 'Rent' });
  await page.locator('#expenseForm input[name="amount"]').fill('15000');
  await setDate(page, '#expenseForm input[name="date"]', '2025-01-01');
  await page.locator('#expenseForm button[type="submit"]').click();
  await expect(page.locator('#expenseList')).toContainText('Household');
  await expect(page.locator('#expenseList')).toContainText('Rent');
});

// TC-IV-008
test('expense history shows all saved records', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goMoney(page, 'expenses');
  for (const [amount, cat] of [['5000', 'Transport'], ['3000', 'Food & Personal']]) {
    await page.locator('#expenseForm select[name="category"]').selectOption({ label: cat });
    await page.locator('#expenseForm input[name="amount"]').fill(amount);
    await setDate(page, '#expenseForm input[name="date"]', today);
    await page.locator('#expenseForm button[type="submit"]').click();
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#expenseList')).toContainText('Transport');
  await expect(page.locator('#expenseList')).toContainText('Food');
});

// TC-IV-009
test('expense updates overview stat', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goMoney(page, 'expenses');
  await page.locator('#expenseForm input[name="amount"]').fill('5000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statExpense')).not.toContainText('₹0');
});

test('transactions tab combines income and expenses', async ({ page }) => {
  await goMoney(page, 'income');
  await page.locator('#incomeForm input[name="amount"]').fill('5000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-15');
  await page.locator('#incomeForm input[name="note"]').fill('Monthly salary');
  await page.locator('#incomeForm button[type="submit"]').click();

  await clickSegBtn(page, 'expenses', 'money');
  await page.locator('#expenseForm input[name="amount"]').fill('1200');
  await setDate(page, '#expenseForm input[name="date"]', '2025-01-16');
  await page.locator('#expenseForm input[name="note"]').fill('Groceries');
  await page.locator('#expenseForm button[type="submit"]').click();

  await page.locator('[data-sv="transactions"]').click();
  await expect(page.locator('#transactionList')).toContainText('Monthly salary');
  await expect(page.locator('#transactionList')).toContainText('Groceries');
  await expect(page.locator('#transactionList')).toContainText('Income');
  await expect(page.locator('#transactionList')).toContainText('Expense');
});

// TC-IV-010
test('budget save locks form and edit unlocks it', async ({ page }) => {
  await goMoney(page, 'budget');
  await expect(page.locator('#budgetDistributionCard')).toBeVisible();
  await page.locator('input[name="cat_Household"]').fill('20000');
  await page.locator('#budgetSaveBtn').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
  await expect(page.locator('#budgetNeedPercent')).toHaveText('100%');
  await expect(page.locator('input[name="cat_Household"]')).toBeDisabled();
  await page.locator('#budgetEditBtn').click();
  await expect(page.locator('input[name="cat_Household"]')).toBeEnabled();
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#budgetDistributionCard')).not.toBeVisible();
});

test('budget vs actual includes subcategory rows', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goMoney(page, 'expenses');
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Household' });
  await page.locator('#expSubcatSelect').selectOption({ label: 'Rent' });
  await page.locator('#expenseForm input[name="amount"]').fill('15000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();

  await clickSegBtn(page, 'budget', 'money');
  await page.locator('input[name="sub_Household_Rent"]').fill('200');
  await page.locator('input[name="sub_Household_Electricity"]').fill('200');
  await expect(page.locator('input[name="cat_Household"]')).toHaveValue('400');
  await page.locator('#budgetSaveBtn').click();
  await expect(page.locator('#budgetActuals')).toContainText('Rent');
  await expect(page.locator('#budgetActuals')).toContainText(/15,000|15000/);
});

// TC-IV-011
test('budget month navigation changes label', async ({ page }) => {
  await goMoney(page, 'budget');
  const initial = await page.locator('#budgetMonthLabel').textContent();
  await page.locator('#budgetPrev').click();
  await expect(page.locator('#budgetMonthLabel')).not.toHaveText(initial!);
  await page.locator('#budgetNext').click();
  await expect(page.locator('#budgetMonthLabel')).toHaveText(initial!);
});

// VO-11: budget actuals include loan EMI payments
test('budget actuals include loan EMI payment', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goInvest(page, 'loans');
  await page.locator('#addLoanBtn').click();
  await waitModal(page);
  await page.locator('select[name="loanType"]').selectOption({ label: 'Personal Loan' });
  await page.locator('input[name="name"]').fill('Test EMI Loan');
  await page.locator('input[name="principal"]').fill('100000');
  await page.locator('input[name="interestRate"]').fill('10');
  await page.locator('input[name="outstanding"]').fill('90000');
  await page.locator('input[name="emi"]').fill('3000');
  await setDate(page, 'input[name="startDate"]', today);
  await submitModal(page);
  await page.waitForTimeout(300);

  await goMoney(page, 'budget');
  await page.locator('input[name="cat_Loans___Financial"]').fill('5000');
  await page.locator('#budgetSaveBtn').click();
  await expect(page.locator('#budgetActuals')).toContainText('Loans');
});

// VO-11: budget actuals include investment contributions
test('budget actuals include investment contribution', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goMoney(page, 'expenses');
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Savings & Investments' });
  await page.locator('#expenseForm input[name="amount"]').fill('2000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();

  await clickSegBtn(page, 'budget', 'money');
  await page.locator('input[name="cat_Savings___Investments"]').fill('5000');
  await page.locator('#budgetSaveBtn').click();
  await expect(page.locator('#budgetActuals')).toContainText('Savings');
  await expect(page.locator('#budgetActuals')).toContainText(/2,000|2000/);
});

// TC-IV-012: add investment via collapsible Savings section
test('add investment appears in list', async ({ page }) => {
  await goInvest(page, 'investments');
  await openInvSection(page, 'sav');
  await page.locator('#addInvBtn').click();
  await waitModal(page);
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'FD' });
  await page.locator('#modalBody input[name="name"]').fill('SBI FD');
  await page.locator('#modalBody input[name="provider"]').fill('SBI');
  await page.locator('#modalBody input[name="currentValue"]').fill('100000');
  await page.locator('#modalBody input[name="interestRate"]').fill('7');
  await submitModal(page);
  await expect(page.locator('#invList')).toContainText('SBI FD');
});

// VO-12: investment shows inline contribution history after payment
test('investment shows inline contribution history after payment', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await goInvest(page, 'investments');
  await openInvSection(page, 'sav');
  await page.locator('#addInvBtn').click();
  await waitModal(page);
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'RD' });
  await page.locator('#modalBody input[name="name"]').fill('History RD');
  await page.locator('#modalBody input[name="provider"]').fill('SBI');
  await page.locator('#modalBody input[name="currentValue"]').fill('10000');
  await submitModal(page);
  await page.waitForTimeout(300);

  await goMoney(page, 'expenses');
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Savings & Investments' });
  await page.waitForTimeout(300);
  await page.locator('#expLinkedSelect').selectOption({ index: 1 });
  await page.locator('#expenseForm input[name="amount"]').fill('5000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();

  await goInvest(page, 'investments');
  await expect(page.locator('#invList')).toContainText('Contribution History (1)');
  await expect(page.locator('#invList')).toContainText(/5,000|5000/);
});

// Gold: add holding, update price, verify overview
test('add gold calculates purchase value and overview', async ({ page }) => {
  await goInvest(page, 'investments');
  await openInvSection(page, 'gold');
  await page.locator('#addGoldBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="name"]').fill('Gold Chain');
  await page.locator('#modalBody input[name="grams"]').fill('10');
  await page.locator('#modalBody select[name="goldType"]').selectOption({ label: 'Jewellery' });
  await page.locator('#modalBody input[name="goldRate"]').fill('5000');
  await page.locator('#modalBody input[name="makingCharge"]').fill('1000');
  await page.locator('#modalBody input[name="gstRate"]').fill('3');
  await expect(page.locator('#modalBody input[name="purchaseTotal"]')).toHaveValue('52530.00');
  await submitModal(page);

  // open gold price editor
  await page.locator('#updateGoldPriceBtn').click();
  await expect(page.locator('#goldPriceEditor')).toBeVisible();
  await page.locator('#currentGoldPricePerGram').fill('6000');
  await page.locator('#saveGoldPriceBtn').click();

  await expect(page.locator('#goldOverview')).toContainText('10.000 g');
  await expect(page.locator('#goldOverview')).toContainText(/52,530|52530/);
  await expect(page.locator('#goldOverview')).toContainText(/7,470|7470/);
});

// Demat tab — #dematAddBtn and #dematUpdateValBtn are static header buttons
test('add Demat account and contribute through expenses', async ({ page }) => {
  await goInvest(page, 'demat');
  await page.locator('#dematAddBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="name"]').fill('ABC Demat');
  await page.locator('#modalBody input[name="investedValue"]').fill('100000');
  await submitModal(page);

  // update portfolio value
  await page.locator('#dematUpdateValBtn').click();
  await expect(page.locator('#dematValueEditor2')).toBeVisible();
  await page.locator('#dematPortfolioInput').fill('120000');
  await page.locator('#dematSaveValBtn').click();
  await expect(page.locator('#dematValueEditor2')).not.toBeVisible();

  // contribute via expenses
  await goMoney(page, 'expenses');
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Savings & Investments' });
  await page.waitForTimeout(300);
  // label in option: "ABC Demat · Invested: ..."
  await expect(page.locator('#expLinkedSelect')).toContainText('Invested:');
  await expect(page.locator('#expLinkedSelect')).toContainText('Portfolio:');
  const dematOption = page.locator('#expLinkedSelect option', { hasText: 'ABC Demat' });
  await page.locator('#expLinkedSelect').selectOption({ value: await dematOption.getAttribute('value') ?? '' });
  await page.locator('#expenseForm input[name="amount"]').fill('5000');
  await setDate(page, '#expenseForm input[name="date"]', new Date().toISOString().slice(0, 10));
  await page.locator('#expenseForm button[type="submit"]').click();

  // verify Demat tab — renderDemat() shows "Invested:" in sub text
  await goInvest(page, 'demat');
  await expect(page.locator('#dematList')).toContainText('ABC Demat');
  await expect(page.locator('#dematList')).toContainText(/1,05,000|105,000|105000/);

  // net worth reflects portfolio value
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statNetWorth')).toContainText(/1,20,000|120,000|120000/);
});

test('demat update value editor toggles and saves', async ({ page }) => {
  await goInvest(page, 'demat');
  await page.locator('#dematAddBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="name"]').fill('Test Demat');
  await page.locator('#modalBody input[name="investedValue"]').fill('50000');
  await submitModal(page);

  await page.locator('#dematUpdateValBtn').click();
  await expect(page.locator('#dematValueEditor2')).toBeVisible();
  await page.locator('#dematPortfolioInput').fill('60000');
  await page.locator('#dematSaveValBtn').click();
  expect((await getToast(page)).toLowerCase()).toContain('portfolio value updated');
  await expect(page.locator('#dematValueEditor2')).not.toBeVisible();
});

// NPS tab — single-account design
test('NPS tab shows setup prompt when no account exists', async ({ page }) => {
  await goInvest(page, 'nps');
  await expect(page.locator('#sv-nps')).toHaveClass(/active/);
  // renderNps() renders: "No NPS account set up yet."
  await expect(page.locator('#npsList')).toContainText('No NPS account set up yet');
  await expect(page.locator('#npsSetupBtn')).toBeVisible();
});

test('NPS setup creates account and shows inline action buttons', async ({ page }) => {
  await goInvest(page, 'nps');
  await page.locator('#npsSetupBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="provider"]').fill('HDFC Pension');
  await page.locator('#modalBody input[name="currentValue"]').fill('50000');
  await submitModal(page);
  await expect(page.locator('#npsList')).toContainText('HDFC Pension');
  await expect(page.locator('#npsList')).toContainText(/50,000|50000/);
  await expect(page.locator('#npsContribBtn')).toBeVisible();
  await expect(page.locator('#npsValBtn')).toBeVisible();
  await expect(page.locator('#npsHistBtn')).toBeVisible();
  await expect(page.locator('#npsEditBtn')).toBeVisible();
  await expect(page.locator('#npsDelBtn')).toBeVisible();
});

test('NPS add contribution updates contribution total', async ({ page }) => {
  await goInvest(page, 'nps');
  await page.locator('#npsSetupBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="provider"]').fill('SBI Pension');
  await page.locator('#modalBody input[name="currentValue"]').fill('100000');
  await submitModal(page);

  await page.locator('#npsContribBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="amount"]').fill('5000');
  await submitModal(page);
  // renderNps() renders: "Contributions: <b>..."
  await expect(page.locator('#npsList')).toContainText('Contributions:');
  await expect(page.locator('#npsList')).toContainText(/5,000|5000/);
});

test('NPS update value reflects new corpus', async ({ page }) => {
  await goInvest(page, 'nps');
  await page.locator('#npsSetupBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="provider"]').fill('LIC Pension');
  await page.locator('#modalBody input[name="currentValue"]').fill('80000');
  await submitModal(page);

  await page.locator('#npsValBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="currentValue"]').fill('90000');
  await submitModal(page);
  await expect(page.locator('#npsList')).toContainText(/90,000|90000/);
});

test('NPS history modal opens and shows entries', async ({ page }) => {
  await goInvest(page, 'nps');
  await page.locator('#npsSetupBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="provider"]').fill('ICICI Pension');
  await page.locator('#modalBody input[name="currentValue"]').fill('60000');
  await submitModal(page);

  await page.locator('#npsContribBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="amount"]').fill('3000');
  await submitModal(page);

  await page.locator('#npsHistBtn').click();
  await waitModal(page);
  await expect(page.locator('#modalBody')).toContainText('Contribution');
  await expect(page.locator('#modalBody')).toContainText(/3,000|3000/);
});

test('NPS delete account returns to setup prompt', async ({ page }) => {
  await goInvest(page, 'nps');
  await page.locator('#npsSetupBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="provider"]').fill('Temp Pension');
  await page.locator('#modalBody input[name="currentValue"]').fill('10000');
  await submitModal(page);
  await autoConfirm(page);
  await page.locator('#npsDelBtn').click();
  await expect(page.locator('#npsList')).toContainText('No NPS account set up yet');
  await expect(page.locator('#npsSetupBtn')).toBeVisible();
});

// TC-IV-013
test('add loan appears in list', async ({ page }) => {
  await goInvest(page, 'loans');
  await page.locator('#addLoanBtn').click();
  await waitModal(page);
  await page.locator('select[name="loanType"]').selectOption({ label: 'Personal Loan' });
  await page.locator('input[name="name"]').fill('HDFC Loan');
  await page.locator('input[name="principal"]').fill('200000');
  await page.locator('input[name="interestRate"]').fill('12');
  await page.locator('input[name="outstanding"]').fill('180000');
  await page.locator('input[name="emi"]').fill('5000');
  await submitModal(page);
  await expect(page.locator('#loanList')).toContainText('HDFC Loan');
});

// TC-IV-014
test('loan auto-creates reminder when due date set', async ({ page }) => {
  await goInvest(page, 'loans');
  await page.locator('#addLoanBtn').click();
  await waitModal(page);
  await page.locator('input[name="name"]').fill('Reminder Loan');
  await page.locator('input[name="principal"]').fill('50000');
  await page.locator('input[name="outstanding"]').fill('50000');
  await setDate(page, 'input[name="dueDate"]', '2099-05-01');
  await submitModal(page);
  const badge = page.locator('#bellReminderBadge');
  await expect(badge).toBeVisible();
  expect(parseInt(await badge.textContent() ?? '0')).toBeGreaterThanOrEqual(1);
});

// TC-IV-015
test('add reminder from bell panel', async ({ page }) => {
  await page.locator('#bellReminderBtn').click();
  await page.locator('#floatingAddReminderBtn').click();
  await page.locator('#bellReminderForm input[name="title"]').fill('EMI Due');
  await setDate(page, '#bellReminderForm input[name="date"]', '2099-03-01');
  await page.locator('#bellReminderForm button[type="submit"]').click();
  await expect(page.locator('#bellRemList')).toContainText('EMI Due');
});

test('cash wallets separate add cash and spend cash', async ({ page }) => {
  await goMoney(page, 'income');
  await page.locator('#incomeForm input[name="amount"]').fill('110000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-15');
  await page.locator('#incomeForm button[type="submit"]').click();

  await page.locator('#cashWalletFab').click();
  await expect(page.locator('#cashWalletPanel')).toHaveClass(/open/);

  const walletDetails = [
    ['Sabarimala Temple', 'Family / Religious / Social', 'Festivals / Pooja'],
    ['Medicine Expense', 'Health & Emergency', 'Medicine / Pharmacy'],
    ['Milk', 'Food & Personal', 'Milk & Dairy'],
    ['Other', 'Other', 'Miscellaneous'],
  ];
  for (const [name, category, subcategory] of walletDetails) {
    await page.locator('#cashWalletAddBtn').click();
    await waitModal(page);
    await page.locator('#modalBody input[name="name"]').fill(name);
    await page.locator('#modalBody select[name="category"]').selectOption({ label: category });
    await page.locator('#modalBody select[name="subcategory"]').selectOption({ label: subcategory });
    await page.locator('#modalBody button[type="submit"]').click();
    await waitModalClosed(page);
  }
  await expect(page.locator('#cashWalletList')).toContainText('Sabarimala Temple');
  await expect(page.locator('#cashWalletList')).toContainText('Festivals / Pooja');

  await page.locator('#cashWalletWithdrawBtn').click();
  await waitModal(page);
  await expect(page.locator('#modalTitle')).toHaveText('Add Cash to Wallet');
  await page.locator('#modalBody input[name="amount"]').fill('100000');
  const walletId = await page.locator('#modalBody select[name="walletId"] option').first().getAttribute('value');
  await page.locator('#modalBody select[name="walletId"]').selectOption(walletId!);
  await page.locator('#modalBody button[type="submit"]').click();
  await waitModalClosed(page);
  await expect(page.locator('#accountBalance')).toContainText(/10,000|10000/);
  await expect(page.locator('#walletBalance')).toContainText(/1,00,000|100000/);

  await page.locator('#cashWalletSpendBtn').click();
  await waitModal(page);
  await expect(page.locator('#modalTitle')).toHaveText('Spend Cash');
  await page.locator('#modalBody input[name="amount"]').fill('500');
  await page.locator('#modalBody input[name="purpose"]').fill('Milk');
  await page.locator('#modalBody select[name="walletId"]').selectOption(walletId!);
  await page.locator('#modalBody button[type="submit"]').click();
  await waitModalClosed(page);
  await expect(page.locator('#walletBalance')).toContainText(/99,500|99500/);
  await expect(page.locator('#statExpense')).toContainText(/500/);
});

test('empty cash wallet can be deleted after confirmation', async ({ page }) => {
  await page.locator('#cashWalletFab').click();
  await page.locator('#cashWalletAddBtn').click();
  await waitModal(page);
  await page.locator('#modalBody input[name="name"]').fill('Temporary Wallet');
  await page.locator('#modalBody button[type="submit"]').click();
  await waitModalClosed(page);
  await expect(page.locator('#cashWalletList')).toContainText('Temporary Wallet');
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('[data-wallet-delete]').click();
  await expect(page.locator('#cashWalletList')).not.toContainText('Temporary Wallet');
});

// TC-IV-017
test('settings panel saves name', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  await page.locator('#spName').fill('Finance User');
  await page.locator('#spSave').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
});
