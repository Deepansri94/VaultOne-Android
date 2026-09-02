import { test, expect } from '@playwright/test';
import { URLS, clearIDB, getToast, autoConfirm } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto(URLS.family);
  await clearIDB(page, 'FamilyVaultDB');
  await page.goto(URLS.family);
  await page.waitForLoadState('domcontentloaded');
});

async function addHousehold(page: any, name = 'Test House') {
  await page.locator('#addHouseBtn').click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('#modalBody .btn.primary').click();
  await page.waitForTimeout(400);
}

async function addPerson(page: any, name = 'John Doe', relation = 'Member') {
  await page.locator('#addPersonBtn').click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="relation"]').fill(relation);
  await page.locator('select[name="householdId"]').selectOption({ index: 1 });
  await page.locator('#modalBody .btn.primary').click();
  await page.waitForTimeout(400);
}

// TC-FV-001
test('FamilyVault page loads', async ({ page }) => {
  await expect(page).toHaveTitle(/FamilyVault/);
  await expect(page.locator('h1')).toContainText('FamilyVault');
});

// TC-FV-002
test('tile counts start at zero', async ({ page }) => {
  for (const id of ['cntPeople', 'cntHouses', 'cntVehicles', 'cntDocs']) {
    await expect(page.locator(`#${id}`)).toHaveText('0');
  }
});

// TC-FV-003
test('add household increments count', async ({ page }) => {
  await page.locator('#addHouseBtn').click();
  await page.locator('input[name="name"]').fill('My Home');
  await page.locator('textarea[name="address"]').fill('123 Main St, Chennai');
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#cntHouses')).toHaveText('1');
});

// TC-FV-004
test('add person increments count', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Jane Doe', 'Spouse');
  await expect(page.locator('#cntPeople')).toHaveText('1');
});

// TC-FV-005
test('people tile shows person in list', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Alice Smith');
  await page.locator('#tile-people').click();
  await expect(page.locator('#familyList')).toContainText('Alice Smith');
});

// TC-FV-006
test('birthday reminder auto-created for person with DOB', async ({ page }) => {
  await addHousehold(page);
  await page.locator('#addPersonBtn').click();
  await page.locator('input[name="name"]').fill('Birthday Person');
  await page.locator('input[name="relation"]').fill('Member');
  await page.locator('select[name="householdId"]').selectOption({ index: 1 });
  await page.locator('input[name="dob"]').fill('1990-08-15');
  await page.locator('#modalBody .btn.primary').click();
  const badge = page.locator('#bellReminderBadge');
  await expect(badge).toBeVisible();
  expect(parseInt(await badge.textContent() ?? '0')).toBeGreaterThanOrEqual(1);
});

// TC-FV-007
test('add vehicle increments count', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Car Owner');
  await page.locator('#addVehicleBtn').click();
  await page.locator('input[name="name"]').fill('My Car');
  await page.locator('input[name="registrationNumber"]').fill('TN01AB1234');
  await page.locator('input[name="make"]').fill('Maruti');
  await page.locator('input[name="model"]').fill('Swift');
  await page.locator('select[name="ownerPersonId"]').selectOption({ index: 1 });
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#cntVehicles')).toHaveText('1');
});

// TC-FV-008
test('add document increments count', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Doc Owner');
  await page.locator('#addDocBtn').click();
  await page.locator('#modalBody input[name="title"]').fill('Aadhaar Card');
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'Aadhaar' });
  await page.locator('#modalBody select[name="ownerType"]').selectOption({ label: 'Person' });
  await page.waitForTimeout(300);
  await page.locator('#modalBody select[name="personId"]').selectOption({ index: 1 });
  await page.locator('#modalBody input[name="documentNumber"]').fill('1234-5678-9012');
  await page.locator('#modalBody .btn.primary').click();
  await expect(page.locator('#cntDocs')).toHaveText('1');
});

// TC-FV-009
test('document search filters results', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Search Person');
  await page.locator('#addDocBtn').click();
  await page.locator('#modalBody input[name="title"]').fill('PAN Card');
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'PAN' });
  await page.locator('#modalBody select[name="ownerType"]').selectOption({ label: 'Person' });
  await page.waitForTimeout(300);
  await page.locator('#modalBody select[name="personId"]').selectOption({ index: 1 });
  await page.locator('#modalBody input[name="documentNumber"]').fill('ABCDE1234F');
  await page.locator('#modalBody .btn.primary').click();

  await page.locator('#tile-documents').click();
  await page.locator('#docSearch').fill('PAN');
  await expect(page.locator('#familyList')).toContainText('PAN Card');

  await page.locator('#docSearch').fill('zzznomatch');
  await expect(page.locator('#familyList')).toContainText('No documents');
});

// TC-FV-010
test('document details shows masked number', async ({ page }) => {
  await addHousehold(page);
  await addPerson(page, 'Detail Person');
  await page.locator('#addDocBtn').click();
  await page.locator('#modalBody input[name="title"]').fill('Passport');
  await page.locator('#modalBody select[name="type"]').selectOption({ label: 'Passport' });
  await page.locator('#modalBody select[name="ownerType"]').selectOption({ label: 'Person' });
  await page.waitForTimeout(300);
  await page.locator('#modalBody select[name="personId"]').selectOption({ index: 1 });
  await page.locator('#modalBody input[name="documentNumber"]').fill('A1234567');
  await page.locator('#modalBody .btn.primary').click();

  await page.locator('#tile-documents').click();
  await page.locator('[data-dview]').first().click();
  const modalText = await page.locator('#modalBody').textContent();
  expect(modalText).toContain('•');
  expect(modalText).not.toContain('A1234567');
});

// TC-FV-011
test('cannot delete household with linked members', async ({ page }) => {
  await addHousehold(page, 'Blocked House');
  await addPerson(page, 'Linked Person');
  await page.locator('#tile-households').click();
  await autoConfirm(page);
  await page.locator('[data-hdel]').first().click();
  expect((await getToast(page))).toContain('Cannot delete');
});

// TC-FV-012
test('edit household name', async ({ page }) => {
  await addHousehold(page, 'Old Name');
  await page.locator('#tile-households').click();
  await page.locator('[data-hedit]').first().click();
  await page.locator('#modalBody input[name="name"]').fill('New Name');
  await page.locator('#modalBody .btn.primary').click();
  await page.locator('#tile-households').click();
  await expect(page.locator('#familyList')).toContainText('New Name');
});

// TC-FV-013
test('settings panel saves name', async ({ page }) => {
  await page.locator('#settingsBtn').click();
  await page.locator('#spName').fill('Family User');
  await page.locator('#spSave').click();
  expect((await getToast(page)).toLowerCase()).toContain('saved');
});

// TC-FV-014
test('home button links to index.html', async ({ page }) => {
  const href = await page.locator('a.home-btn').getAttribute('href');
  expect(href).toContain('index.html');
});
