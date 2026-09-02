import { test, expect } from '@playwright/test';
import { URLS, clearIDB, getToast, autoConfirm } from './helpers';

const TEST_PIN = '123456';

test.beforeEach(async ({ page }) => {
  await page.goto(URLS.password);
  await clearIDB(page, 'PasswordVaultDB');
  await page.goto(URLS.password);
  await page.waitForLoadState('domcontentloaded');
});

async function setPinAndUnlock(page: any, pin = TEST_PIN) {
  await page.locator('#setPinBtn').click();
  await page.locator('input[name="pin"]').fill(pin);
  await page.locator('input[name="pin2"]').fill(pin);
  await page.locator('#modalBody .btn.primary').click();
  await page.waitForTimeout(400);
}

async function addPassword(page: any, name = 'Gmail', username = 'test@gmail.com', password = 'SecurePass@123') {
  await page.locator('#addPassBtn').click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('#modalBody .btn.primary').click();
  await page.waitForTimeout(400);
}

// TC-PV-001
test('PasswordVault page loads', async ({ page }) => {
  await expect(page).toHaveTitle(/PasswordVault/);
  await expect(page.locator('h1')).toContainText('PasswordVault');
});

// TC-PV-002
test('locked state shown on fresh DB', async ({ page }) => {
  const text = await page.locator('#passList').textContent();
  expect(text?.toLowerCase()).toMatch(/no vault pin|locked/);
});

// TC-PV-003
test('set PIN and unlock vault', async ({ page }) => {
  await setPinAndUnlock(page);
  await expect(page.locator('#passList')).toContainText('No passwords stored');
});

// TC-PV-004
test('add password entry appears in list', async ({ page }) => {
  await setPinAndUnlock(page);
  await addPassword(page, 'Gmail', 'test@gmail.com', 'SecurePass@123');
  await expect(page.locator('#passList')).toContainText('Gmail');
});

// TC-PV-005
test('password entry shows username', async ({ page }) => {
  await setPinAndUnlock(page);
  await addPassword(page, 'GitHub', 'dev@github.com', 'GitPass@456');
  await expect(page.locator('#passList')).toContainText('dev@github.com');
});

// TC-PV-006
test('search filters password entries', async ({ page }) => {
  await setPinAndUnlock(page);
  await addPassword(page, 'Netflix', 'user@netflix.com', 'NetPass@456');
  await page.locator('#passSearch').fill('Netflix');
  await expect(page.locator('#passList')).toContainText('Netflix');
  await page.locator('#passSearch').fill('zzznomatch');
  await expect(page.locator('#passList')).toContainText('No passwords');
});

// TC-PV-007
test('lock button locks the vault', async ({ page }) => {
  await setPinAndUnlock(page);
  await page.locator('#lockBtn').click();
  const text = await page.locator('#passList').textContent();
  expect(text?.toLowerCase()).toContain('locked');
});

// TC-PV-008
test('unlock with correct PIN', async ({ page }) => {
  await setPinAndUnlock(page);
  await page.locator('#lockBtn').click();
  await page.locator('#unlockBtn').click();
  await page.locator('input[name="pin"]').fill(TEST_PIN);
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#passList')).toContainText('No passwords stored');
});

// TC-PV-009
test('wrong PIN is rejected', async ({ page }) => {
  await setPinAndUnlock(page);
  await page.locator('#lockBtn').click();
  await page.locator('#unlockBtn').click();
  await page.locator('input[name="pin"]').fill('000000');
  await page.locator('#modalBody .btn.primary').click();
  const toast = await getToast(page);
  expect(toast.toLowerCase()).toMatch(/invalid/);
  const text = await page.locator('#passList').textContent();
  expect(text?.toLowerCase()).toContain('locked');
});

// TC-PV-010
test('delete password entry', async ({ page }) => {
  await setPinAndUnlock(page);
  await addPassword(page, 'ToDelete', 'del@test.com', 'DelPass@789');
  await autoConfirm(page);
  await page.locator('[data-pdel]').first().click();
  await expect(page.locator('#passList')).not.toContainText('ToDelete');
});

// TC-PV-011
test('generate password button shows toast', async ({ page }) => {
  await page.locator('#genPassBtn').click();
  const toast = await getToast(page);
  expect(toast.toLowerCase()).toMatch(/generated|copied/);
});

// TC-PV-012
test('generate inside modal fills password field', async ({ page }) => {
  await setPinAndUnlock(page);
  await page.locator('#addPassBtn').click();
  await page.locator('#genInside').click();
  const value = await page.locator('input[name="password"]').inputValue();
  expect(value.length).toBeGreaterThanOrEqual(16);
});

// TC-PV-013
test('bell panel opens from PasswordVault', async ({ page }) => {
  await page.locator('#bellReminderBtn').click();
  await expect(page.locator('#reminderFloatingPanel')).toHaveClass(/open/);
});

// TC-PV-014
test('add reminder from bell panel', async ({ page }) => {
  await page.locator('#bellReminderBtn').click();
  await page.locator('#floatingAddReminderBtn').click();
  await page.locator('#bellReminderForm input[name="title"]').fill('Test Reminder');
  await page.locator('#bellReminderForm input[name="date"]').fill('2099-12-31');
  await page.locator('#bellReminderForm button[type="submit"]').click();
  await expect(page.locator('#bellRemList')).toContainText('Test Reminder');
});

// TC-PV-015
test('settings panel saves name', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  await page.locator('#spName').fill('Vault User');
  await page.locator('#spSave').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
});

// TC-PV-016
test('home button links to index.html', async ({ page }) => {
  const href = await page.locator('a.home-btn').getAttribute('href');
  expect(href).toContain('index.html');
});
