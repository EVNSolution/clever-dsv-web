import { test, expect } from '@playwright/test';

test('customer inquiry is separate from control', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByLabel('고객 주문 상세')).toHaveCount(0);

  await page.goto('/customer/delivery-inquiry');
  await expect(page.getByRole('heading', { name: 'CLEVER 배송조회' })).toBeVisible();
  await expect(page.getByLabel('고객 주문 상세').getByRole('button', { name: /DSV-2026-0709-01/ })).toBeVisible();
});

test('customer delivery control is fixed to previous current and next day', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv');
  await expect(page.getByLabel('배송조회 날짜').getByRole('button', { name: /전일/ })).toBeVisible();
  await expect(page.getByLabel('배송조회 날짜').getByRole('button', { name: /금일/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('주문 목록').getByText('진행중', { exact: true })).toBeVisible();

  await page.getByLabel('배송조회 날짜').getByRole('button', { name: /전일/ }).click();
  await expect(page.getByLabel('주문 목록').getByText('배송 이력', { exact: true })).toBeVisible();
  await expect(page.getByText('인천 항공 긴급배송', { exact: true })).toBeVisible();

  await page.getByLabel('배송조회 날짜').getByRole('button', { name: /익일/ }).click();
  await expect(page.getByLabel('주문 목록').getByText('예정', { exact: true })).toBeVisible();
  await expect(page.getByText('수원 연구시설 정기배송', { exact: true })).toBeVisible();
});

test('customer delivery control shows no orders outside its date range', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv&day=2');
  await expect(page.getByRole('status').getByText('주문 없음', { exact: true })).toBeVisible();
  await expect(page.getByLabel('주문 목록')).toHaveCount(0);
});

test('CR-330 selection reconciles panel and map', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv');
  await page.waitForFunction(() => window.dsvMap?.getSource('demo-vehicles'));

  const vehicleButton = page.getByRole('button', { name: /CR-330/ });
  await vehicleButton.click();
  await expect(vehicleButton).toHaveClass(/\bactive\b/);
  await expect(vehicleButton).toContainText('33사 7311');

  const features = await page.evaluate(() => window.dsvMap.getSource('demo-vehicles').serialize().data.features);
  expect(features).toHaveLength(1);
  expect(features[0].properties).toMatchObject({ vehicleId: 'proof11', plate: '33사 7311', selected: true });
  expect(features.some((feature) => feature.properties.vehicleId === 'depart01')).toBe(false);
  expect(features.some((feature) => feature.properties.plate === '21사 6101')).toBe(false);
});
