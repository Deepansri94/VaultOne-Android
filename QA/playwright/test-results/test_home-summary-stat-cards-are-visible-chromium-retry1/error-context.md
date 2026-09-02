# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_home.spec.ts >> summary stat cards are visible
- Location: tests\test_home.spec.ts:18:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#statNetWorth')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#statNetWorth')

```

```yaml
- button "⚙️"
- text: 🔐
- heading "VaultOne" [level=1]
- paragraph: Offline-first · All data stays on your device
- link "💰 iVault Personal Finance & Wealth Management":
  - /url: iVault.html
- link "📁 FamilyVault Documents, People & Households":
  - /url: FamilyVault.html
- link "🔑 PasswordVault Encrypted local password manager":
  - /url: PasswordVault.html
- text: VaultOne v2.0 · No server · No cloud
- button "💸"
- button "📝"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { URLS, clearIDB } from './helpers';
  3  | 
  4  | test.beforeEach(async ({ page }) => {
  5  |   await page.goto(URLS.index);
  6  |   await clearIDB(page, 'VaultOneDB');
  7  |   await page.goto(URLS.index);
  8  |   await page.waitForLoadState('domcontentloaded');
  9  | });
  10 | 
  11 | // TC-HM-001
  12 | test('home page loads with correct title', async ({ page }) => {
  13 |   await expect(page).toHaveTitle(/VaultOne/);
  14 |   await expect(page.locator('h1')).toContainText('VaultOne');
  15 | });
  16 | 
  17 | // TC-HM-002
  18 | test('summary stat cards are visible', async ({ page }) => {
  19 |   for (const id of ['statNetWorth', 'statDocs', 'statPasswords', 'statReminders']) {
> 20 |     await expect(page.locator(`#${id}`)).toBeVisible();
     |                                          ^ Error: expect(locator).toBeVisible() failed
  21 |   }
  22 | });
  23 | 
  24 | // TC-HM-003
  25 | test('quick nav buttons link to correct pages', async ({ page }) => {
  26 |   const links = [
  27 |     { text: /iVault/i,        href: 'iVault.html' },
  28 |     { text: /FamilyVault/i,   href: 'FamilyVault.html' },
  29 |     { text: /PasswordVault/i, href: 'PasswordVault.html' },
  30 |   ];
  31 |   for (const { text, href } of links) {
  32 |     const btn = page.getByRole('link', { name: text });
  33 |     await expect(btn).toHaveAttribute('href', new RegExp(href));
  34 |   }
  35 | });
  36 | 
  37 | // TC-HM-004
  38 | test('bell icon opens reminders panel', async ({ page }) => {
  39 |   await page.locator('#bellReminderBtn').click();
  40 |   await expect(page.locator('#reminderFloatingPanel')).toHaveClass(/open/);
  41 | });
  42 | 
  43 | // TC-HM-005
  44 | test('recent activity section is present', async ({ page }) => {
  45 |   await expect(page.locator('#recentActivity, #activityList, .recent-activity')).toBeVisible();
  46 | });
  47 | 
```