import { test, expect } from '@playwright/test';
import { expectPath } from './helpers.js';

test('/ redirects to English control route', async ({ page }) => {
  await page.goto('/');
  await expectPath(page, '/control');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('h1', { hasText: 'CLEVER DSV' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.map-route-engine')).toHaveCount(0);
  await expect(page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-zoom-in')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-zoom-out')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-compass')).toBeVisible();
  await expect(page.getByLabel('예정 차량 리스트')).toBeVisible();
});
test('legacy Korean admin path normalizes to English path', async ({ page }) => {
  await page.goto('/관제');
  await expectPath(page, '/control');
});
test('/login stores the local session and enters control shell', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByText('CLEVER DSV', { exact: true })).toBeVisible();
  await expect(page.getByText('dsv.cleversystem.ai', { exact: true })).toHaveCount(0);
  await page.getByLabel('ID').fill('anything');
  await page.getByLabel('Password').fill('whatever');
  await page.getByRole('button', { name: '로그인', exact: true }).click();

  await expectPath(page, '/control');
  await expect(page.evaluate(() => Boolean(sessionStorage.getItem('clever.auth.token')))).resolves.toBe(true);
});
