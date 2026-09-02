# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: test_home.spec.ts >> bell icon opens reminders panel
- Location: tests\test_home.spec.ts:38:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#bellReminderBtn')

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - button "⚙️" [ref=f1e4] [cursor=pointer]
    - generic [ref=f1e5]: 🔐
    - heading "VaultOne" [level=1] [ref=f1e6]
    - paragraph [ref=f1e7]: Offline-first · All data stays on your device
    - generic [ref=f1e8]:
      - link "💰 iVault Personal Finance & Wealth Management" [ref=f1e9] [cursor=pointer]:
        - /url: iVault.html
        - generic [ref=f1e10]: 💰
        - generic [ref=f1e11]:
          - generic [ref=f1e12]: iVault
          - generic [ref=f1e13]: Personal Finance & Wealth Management
      - link "📁 FamilyVault Documents, People & Households" [ref=f1e14] [cursor=pointer]:
        - /url: FamilyVault.html
        - generic [ref=f1e15]: 📁
        - generic [ref=f1e16]:
          - generic [ref=f1e17]: FamilyVault
          - generic [ref=f1e18]: Documents, People & Households
      - link "🔑 PasswordVault Encrypted local password manager" [ref=f1e19] [cursor=pointer]:
        - /url: PasswordVault.html
        - generic [ref=f1e20]: 🔑
        - generic [ref=f1e21]:
          - generic [ref=f1e22]: PasswordVault
          - generic [ref=f1e23]: Encrypted local password manager
    - generic [ref=f1e24]: VaultOne v2.0 · No server · No cloud
  - button "💸" [ref=f1e25] [cursor=pointer]
  - button "📝" [ref=f1e26] [cursor=pointer]
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
  20 |     await expect(page.locator(`#${id}`)).toBeVisible();
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
> 39 |   await page.locator('#bellReminderBtn').click();
     |                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
  40 |   await expect(page.locator('#reminderFloatingPanel')).toHaveClass(/open/);
  41 | });
  42 | 
  43 | // TC-HM-005
  44 | test('recent activity section is present', async ({ page }) => {
  45 |   await expect(page.locator('#recentActivity, #activityList, .recent-activity')).toBeVisible();
  46 | });
  47 | 
```