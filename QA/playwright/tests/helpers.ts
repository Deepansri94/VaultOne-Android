import { Page } from '@playwright/test';

export const URLS = {
  index:    '/index.html',
  ivault:   '/iVault.html',
  family:   '/FamilyVault.html',
  password: '/PasswordVault.html',
};

export async function clearIDB(page: Page, dbName: string) {
  await page.evaluate((name) => indexedDB.deleteDatabase(name), dbName);
  await page.waitForTimeout(300);
}

export async function getToast(page: Page): Promise<string> {
  try {
    const toast = page.locator('#toast');
    await toast.waitFor({ state: 'visible', timeout: 4000 });
    return (await toast.textContent()) ?? '';
  } catch {
    return '';
  }
}

export async function setDate(page: Page, selector: string, isoDate: string) {
  await page.evaluate(
    ([sel, val]) => {
      const el = document.querySelector(sel as string) as HTMLInputElement;
      if (el) el.value = val as string;
    },
    [selector, isoDate],
  );
}

export async function autoConfirm(page: Page) {
  await page.evaluate(() => { window.confirm = () => true; });
}
