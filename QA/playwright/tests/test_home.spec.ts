import { test, expect } from '@playwright/test';
import { URLS, clearIDB } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto(URLS.index);
  await clearIDB(page, 'iVaultDB');
  await page.goto(URLS.index);
  await page.waitForLoadState('domcontentloaded');
});

// TC-HM-001
test('home page loads with correct title', async ({ page }) => {
  await expect(page).toHaveTitle(/VaultOne/);
  await expect(page.locator('h1')).toContainText('VaultOne');
});

// TC-HM-002 — index.html is a launcher; verify the three app cards are visible
test('all three app launcher cards are visible', async ({ page }) => {
  await expect(page.locator('.app-btn')).toHaveCount(3);
  for (const card of await page.locator('.app-btn').all()) {
    await expect(card).toBeVisible();
  }
});

// TC-HM-003
test('quick nav buttons link to correct pages', async ({ page }) => {
  const links: { text: RegExp; href: string }[] = [
    { text: /iVault/i,        href: 'iVault.html' },
    { text: /FamilyVault/i,   href: 'FamilyVault.html' },
    { text: /PasswordVault/i, href: 'PasswordVault.html' },
  ];
  for (const { text, href } of links) {
    await expect(page.getByRole('link', { name: text })).toHaveAttribute('href', new RegExp(href));
  }
});

// TC-HM-004 — index.html has no bell button; settings button is present instead
test('settings button is visible on launcher', async ({ page }) => {
  await expect(page.locator('#settingsBtn')).toBeVisible();
});

// TC-HM-005 — index.html has no activity feed; footer branding is present
test('footer version text is visible', async ({ page }) => {
  await expect(page.locator('.footer')).toBeVisible();
  await expect(page.locator('.footer')).toContainText('VaultOne');
});
