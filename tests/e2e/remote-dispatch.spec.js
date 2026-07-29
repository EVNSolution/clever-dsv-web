import { test, expect } from '@playwright/test';

test.skip(process.env.VITE_DSV_API_MODE !== 'remote', 'requires the local DSV Docker API');

test('remote DSV session previews, registers a condition, and commits one dispatch row', async ({ page }) => {
  const suffix = Date.now().toString(36).toUpperCase();
  const condition = `UI-${suffix}`;
  const csv = [
    'driver,vehicle,배송처,condition,shippedbox,주소,customer,SellerOrderKey,특이사항,latitude,longitude',
    `김도윤,21사 6101,역삼 진단센터,${condition},2,서울특별시 강남구 테헤란로 152,DSV-HEALTH,DSV-UI-${suffix},UI 통합 검증,37.500643,127.036545`,
  ].join('\n');

  await page.goto('/login');
  await page.getByLabel('ID').fill('operator');
  await page.getByLabel('Password').fill('local-demo-password-2026');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/control$/u);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({ buffer: Buffer.from(csv), mimeType: 'text/csv', name: 'remote-smoke.csv' });

  const candidate = page.locator('.condition-candidate').filter({ hasText: condition });
  await expect(candidate).toBeVisible();
  await candidate.getByLabel('명칭').fill(condition);
  await candidate.getByLabel('설명').fill('프런트 원격 API 통합 검증 조건');
  await candidate.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();
  await expect(page.getByText('1건 업로드 완료')).toBeVisible();
});
