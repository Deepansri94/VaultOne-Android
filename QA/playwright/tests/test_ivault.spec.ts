import { test, expect } from '@playwright/test';
import { URLS, clearIDB, getToast, setDate, autoConfirm } from './helpers';

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

// TC-IV-003
test('nav tabs switch sub-views', async ({ page }) => {
  for (const tab of ['income', 'expenses', 'budget', 'investments', 'loans']) {
    await page.locator(`[data-sv="${tab}"]`).click();
    await expect(page.locator(`#sv-${tab}`)).toHaveClass(/active/);
  }
});

// TC-IV-004
test('add income record', async ({ page }) => {
  await page.locator('[data-sv="income"]').click();
  await page.locator('#incomeForm select[name="type"]').selectOption({ label: 'Salary' });
  await page.locator('#incomeForm input[name="amount"]').fill('50000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-15');
  await page.locator('#incomeForm button[type="submit"]').click();
  await expect(page.locator('#incomeList')).toContainText('Salary');
  await expect(page.locator('#incomeList')).toContainText(/50,000|50000/);
});

// TC-IV-005
test('income updates overview stat', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('[data-sv="income"]').click();
  await page.locator('#incomeForm input[name="amount"]').fill('30000');
  await setDate(page, '#incomeForm input[name="date"]', today);
  await page.locator('#incomeForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statIncome')).not.toContainText('₹0');
});

// TC-IV-006
test('delete income record', async ({ page }) => {
  await page.locator('[data-sv="income"]').click();
  await page.locator('#incomeForm input[name="amount"]').fill('1000');
  await setDate(page, '#incomeForm input[name="date"]', '2025-02-01');
  await page.locator('#incomeForm button[type="submit"]').click();
  await autoConfirm(page);
  await page.locator('[data-idel]').first().click();
  await expect(page.locator('#incomeList')).toContainText('No income');
});

// TC-IV-007
test('add expense with sub-category', async ({ page }) => {
  await page.locator('[data-sv="expenses"]').click();
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
  await page.locator('[data-sv="expenses"]').click();
  for (const [amount, cat] of [['5000', 'Transport'], ['3000', 'Food & Personal']]) {
    await page.locator('#expenseForm select[name="category"]').selectOption({ label: cat });
    await page.locator('#expenseForm input[name="amount"]').fill(amount);
    await setDate(page, '#expenseForm input[name="date"]', today);
    await page.locator('#expenseForm button[type="submit"]').click();
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#expenseList')).toContainText('Transport');
  await expect(page.locator('#expenseList')).toContainText('Food');
});

// TC-IV-009
test('expense updates overview stat', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('[data-sv="expenses"]').click();
  await page.locator('#expenseForm input[name="amount"]').fill('5000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statExpense')).not.toContainText('₹0');
});

// TC-IV-010
test('budget save locks form and edit unlocks it', async ({ page }) => {
  await page.locator('[data-sv="budget"]').click();
  await page.locator('input[name="cat_Household"]').fill('20000');
  await page.locator('#budgetSaveBtn').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
  await expect(page.locator('input[name="cat_Household"]')).toBeDisabled();
  await page.locator('#budgetEditBtn').click();
  await expect(page.locator('input[name="cat_Household"]')).toBeEnabled();
});

test('budget vs actual includes subcategory rows', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10);
  await page.locator('[data-sv="expenses"]').click();
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Household' });
  await page.locator('#expSubcatSelect').selectOption({ label: 'Rent' });
  await page.locator('#expenseForm input[name="amount"]').fill('15000');
  await setDate(page, '#expenseForm input[name="date"]', today);
  await page.locator('#expenseForm button[type="submit"]').click();

  await page.locator('[data-sv="budget"]').click();
  await page.locator('input[name="sub_Household_Rent"]').fill('200');
  await page.locator('input[name="sub_Household_Electricity"]').fill('200');
  await expect(page.locator('input[name="cat_Household"]')).toHaveValue('400');
  await page.locator('#budgetSaveBtn').click();

  const table = page.locator('#budgetActuals');
  await expect(table).toContainText('Rent');
  await expect(table).toContainText(/15,000|15000/);
});

// TC-IV-011
test('budget month navigation changes label', async ({ page }) => {
  await page.locator('[data-sv="budget"]').click();
  const initial = await page.locator('#budgetMonthLabel').textContent();
  await page.locator('#budgetPrev').click();
  await expect(page.locator('#budgetMonthLabel')).not.toHaveText(initial!);
  await page.locator('#budgetNext').click();
  await expect(page.locator('#budgetMonthLabel')).toHaveText(initial!);
});

// TC-IV-012
test('add investment appears in list', async ({ page }) => {
  await page.locator('[data-sv="investments"]').click();
  await page.locator('#addInvBtn').click();
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'FD' });
  await page.locator('#modalBody input[name="name"]').fill('SBI FD');
  await page.locator('#modalBody input[name="provider"]').fill('SBI');
  await page.locator('#modalBody input[name="currentValue"]').fill('100000');
  await page.locator('#modalBody input[name="interestRate"]').fill('7');
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#invList')).toContainText('SBI FD');
});

test('add gold calculates purchase value and overview', async ({ page }) => {
  await page.locator('[data-sv="investments"]').click();
  await page.locator('#addGoldBtn').click();
  await page.locator('#modalBody input[name="name"]').fill('Gold Chain');
  await page.locator('#modalBody input[name="grams"]').fill('10');
  await page.locator('#modalBody select[name="goldType"]').selectOption({ label: 'Jewellery' });
  await page.locator('#modalBody input[name="goldRate"]').fill('5000');
  await page.locator('#modalBody input[name="makingCharge"]').fill('1000');
  await page.locator('#modalBody input[name="gstRate"]').fill('3');
  await expect(page.locator('#modalBody input[name="purchaseTotal"]')).toHaveValue('52530.00');
  await page.locator('#modalBody .btn.primary').click();
  await page.locator('#updateGoldPriceBtn').click();
  await page.locator('#currentGoldPricePerGram').fill('6000');
  await page.locator('#saveGoldPriceBtn').click();

  await expect(page.locator('#goldOverview')).toContainText('10.000 g');
  await expect(page.locator('#goldOverview')).toContainText(/52,530|52530/);
  await expect(page.locator('#goldOverview')).toContainText(/7,470|7470/);
});

test('add Demat account and contribute through expenses', async ({ page }) => {
  await page.locator('[data-sv="investments"]').click();
  await page.locator('#addDematBtn').click();
  await page.locator('#modalBody input[name="name"]').fill('ABC Demat');
  await page.locator('#modalBody input[name="investedValue"]').fill('100000');
  await page.locator('#modalBody .btn.primary').click();
  await page.locator('#updateDematValueBtn').click();
  await page.locator('#currentDematPortfolioValue').fill('120000');
  await page.locator('#saveDematValueBtn').click();

  await page.locator('[data-sv="expenses"]').click();
  await page.locator('#expenseForm select[name="category"]').selectOption({ label: 'Savings & Investments' });
  await expect(page.locator('#expLinkedSelect')).toContainText('Invested:');
  await expect(page.locator('#expLinkedSelect')).toContainText('Portfolio:');
  const dematOption = page.locator('#expLinkedSelect option', { hasText: 'ABC Demat' });
  await page.locator('#expLinkedSelect').selectOption({ value: await dematOption.getAttribute('value') ?? undefined });
  await page.locator('#expenseForm input[name="amount"]').fill('5000');
  await setDate(page, '#expenseForm input[name="date"]', new Date().toISOString().slice(0, 10));
  await page.locator('#expenseForm button[type="submit"]').click();

  await page.locator('[data-sv="investments"]').click();
  await expect(page.locator('#dematOverview')).toContainText('Invested Value');
  await expect(page.locator('#dematOverview')).toContainText(/1,05,000|105,000|105000/);
  await expect(page.locator('#dematOverview')).toContainText(/15,000|15000/);
  await page.locator('[data-sv="overview"]').click();
  await expect(page.locator('#statNetWorth')).toContainText(/1,20,000|120,000|120000/);
});

// TC-IV-013
test('add loan appears in list', async ({ page }) => {
  await page.locator('[data-sv="loans"]').click();
  await page.locator('#addLoanBtn').click();
  await page.locator('select[name="loanType"]').selectOption({ label: 'Personal Loan' });
  await page.locator('input[name="name"]').fill('HDFC Loan');
  await page.locator('input[name="principal"]').fill('200000');
  await page.locator('input[name="interestRate"]').fill('12');
  await page.locator('input[name="outstanding"]').fill('180000');
  await page.locator('input[name="emi"]').fill('5000');
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#loanList')).toContainText('HDFC Loan');
});

// TC-IV-014
test('loan auto-creates reminder when due date set', async ({ page }) => {
  await page.locator('[data-sv="loans"]').click();
  await page.locator('#addLoanBtn').click();
  await page.locator('input[name="name"]').fill('Reminder Loan');
  await page.locator('input[name="principal"]').fill('50000');
  await page.locator('input[name="outstanding"]').fill('50000');
  await setDate(page, 'input[name="dueDate"]', '2099-05-01');
  await page.locator('#modalBody .btn.primary').click();
  const badge = page.locator('#bellReminderBadge');
  await expect(badge).toBeVisible();
  const count = parseInt(await badge.textContent() ?? '0');
  expect(count).toBeGreaterThanOrEqual(1);
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

// TC-IV-016
test('money values have no decimal places', async ({ page }) => {
  await page.locator('[data-sv="income"]').click();
  await page.locator('#incomeForm input[name="amount"]').fill('12345');
  await setDate(page, '#incomeForm input[name="date"]', '2025-01-01');
  await page.locator('#incomeForm button[type="submit"]').click();
  await page.locator('[data-sv="overview"]').click();
  const text = await page.locator('#statIncome').textContent();
  expect(text).not.toMatch(/\.\d{2}/);
});

// TC-IV-017
test('settings panel saves name', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  await page.locator('#spName').fill('Finance User');
  await page.locator('#spSave').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
});
