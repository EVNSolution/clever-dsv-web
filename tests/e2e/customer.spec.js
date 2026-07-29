import { test, expect } from '@playwright/test';

test('customer inquiry is separate from control', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByLabel('고객 주문 상세')).toHaveCount(0);

  await page.goto('/customer/delivery-inquiry');
  await expect(page.getByRole('heading', { name: 'CLEVER 배송조회' })).toBeVisible();
  await expect(page.getByLabel('고객 주문 상세').getByText('주문 없음', { exact: true })).toBeVisible();
});

test('customer delivery control is fixed to previous current and next day', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv');
  await expect(page.getByLabel('배송조회 날짜').getByRole('button', { name: /전일/ })).toBeVisible();
  await expect(page.getByLabel('배송조회 날짜').getByRole('button', { name: /금일/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('주문 없음', { exact: true })).toBeVisible();

  await page.getByLabel('배송조회 날짜').getByRole('button', { name: /전일/ }).click();
  await expect(page.getByText('주문 없음', { exact: true })).toBeVisible();

  await page.getByLabel('배송조회 날짜').getByRole('button', { name: /익일/ }).click();
  await expect(page.getByText('주문 없음', { exact: true })).toBeVisible();
});

test('customer delivery control shows no orders outside its date range', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv&day=2');
  await expect(page.getByRole('status').getByText('주문 없음', { exact: true })).toBeVisible();
  await expect(page.getByLabel('주문 목록')).toHaveCount(0);
});

test('customer inquiry has no fabricated vehicle assignments or map data', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv');
  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());

  await expect(page.getByText('주문 없음', { exact: true })).toBeVisible();
  await expect(page.getByText(/CR-\d+/)).toHaveCount(0);
  const syntheticSources = await page.evaluate(() => Object.keys(window.dsvMap.getStyle().sources).filter((sourceId) => sourceId.startsWith('demo-')));
  expect(syntheticSources).toEqual([]);
});
