import { test, expect } from '@playwright/test';

test('renders DSV web shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Clever - DSV' })).toBeVisible();
  await expect(page.getByText('DSV 전용 웹 프론트엔드 준비 화면')).toBeVisible();
  await expect(page.getByText('기존 HTML 데모는 docs/reference/demo-reference에 골든뷰로 보존합니다.')).toBeVisible();
});
