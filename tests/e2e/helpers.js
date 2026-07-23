import { expect } from '@playwright/test';

export async function expectPath(page, path) {
  await expect.poll(() => page.evaluate(() => decodeURI(window.location.pathname))).toBe(path);
}
