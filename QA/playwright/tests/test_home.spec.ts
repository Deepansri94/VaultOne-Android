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

// VO-14: footer version label element exists
test('footer has app version label element', async ({ page }) => {
  await expect(page.locator('#appVersionLabel')).toBeAttached();
});

// VO-14: "What's new" button is visible in footer
test('whats new button is visible in footer', async ({ page }) => {
  await expect(page.locator('#releaseNotesBtn')).toBeVisible();
});

// VO-14: release notes modal opens when "What's new" is clicked
test('release notes modal opens on whats new click', async ({ page }) => {
  // Intercept GitHub API to avoid network dependency in tests
  await page.route('**/api.github.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        name: 'VaultOne 2.82',
        tag_name: 'v2.82',
        published_at: '2025-01-01T00:00:00Z',
        body: 'Test release notes'
      }])
    });
  });
  await page.goto(URLS.index);
  await page.waitForLoadState('domcontentloaded');
  // Dismiss auto-show modal if it appears
  const modal = page.locator('#releaseNotesModal');
  try {
    await modal.waitFor({ state: 'visible', timeout: 2000 });
    await page.locator('#releaseNotesClose').click();
  } catch {}
  await page.locator('#releaseNotesBtn').click();
  await expect(modal).toHaveClass(/open/);
  await expect(page.locator('#releaseNotesBody')).toContainText('VaultOne 2.82');
});

// VO-14: release notes modal closes on close button
test('release notes modal closes on close button', async ({ page }) => {
  await page.route('**/api.github.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'VaultOne 2.82', tag_name: 'v2.82', published_at: '2025-01-01T00:00:00Z', body: '' }])
    });
  });
  await page.goto(URLS.index);
  await page.waitForLoadState('domcontentloaded');
  const modal = page.locator('#releaseNotesModal');
  try {
    await modal.waitFor({ state: 'visible', timeout: 2000 });
    await page.locator('#releaseNotesClose').click();
  } catch {}
  await page.locator('#releaseNotesBtn').click();
  await expect(modal).toHaveClass(/open/);
  await page.locator('#releaseNotesClose').click();
  await expect(modal).not.toHaveClass(/open/);
});

// VO-14: version label updates from API response
test('footer version label updates from API', async ({ page }) => {
  await page.route('**/api.github.com/**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'VaultOne 2.82', tag_name: 'v2.82', published_at: '2025-01-01T00:00:00Z', body: '' }])
    });
  });
  await page.goto(URLS.index);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
  await expect(page.locator('#appVersionLabel')).toContainText('VaultOne 2.82');
});
