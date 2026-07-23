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
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/control$/u);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({ buffer: Buffer.from(csv), mimeType: 'text/csv', name: 'remote-smoke.csv' });
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();

  const candidate = page.locator('.condition-candidate').filter({ hasText: condition });
  await expect(candidate).toBeVisible();
  await candidate.getByLabel('명칭').fill(condition);
  await candidate.getByLabel('설명').fill('프런트 원격 API 통합 검증 조건');
  await candidate.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();
  await expect(page.getByText('1건 업로드 완료')).toBeVisible();
});

test('remote DSV resource management persists drivers, vehicles, and assignments', async ({ page }) => {
  const suffix = Date.now().toString(36).toUpperCase();
  const driverName = `원격 배송원 ${suffix}`;
  const plate = `99원 ${suffix.slice(-4)}`;

  await page.goto('/login');
  await page.getByLabel('ID').fill('operator');
  await page.getByLabel('Password').fill('local-demo-password-2026');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/control$/u);
  await page.goto('/master-data');
  await page.getByRole('button', { name: '운송자원', exact: true }).click();
  await page.getByRole('button', { name: '배송원', exact: true }).click();

  await page.getByRole('button', { name: '배송원 등록', exact: true }).click();
  const driverForm = page.getByLabel('배송원 편집');
  await driverForm.getByLabel('이름').fill(driverName);
  await driverForm.getByLabel('연령').fill('38');
  await driverForm.getByLabel('경력').fill('원격 API 검증');
  await driverForm.getByLabel('담당 권역').fill('서울');
  await driverForm.getByLabel('업무 특성').fill('원격 저장');
  await driverForm.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByLabel('배송원 리스트').locator('tr', { hasText: driverName })).toBeVisible();

  await page.getByRole('button', { name: '차량', exact: true }).click();
  await page.getByRole('button', { name: '차량 등록', exact: true }).click();
  const vehicleForm = page.getByLabel('차량 편집');
  await vehicleForm.getByLabel('차량 번호').fill(plate);
  await vehicleForm.getByLabel('차종').fill('냉장탑차');
  await vehicleForm.getByLabel('메모').fill('원격 API 검증');
  await vehicleForm.getByRole('button', { name: '저장', exact: true }).click();
  const vehicleRow = page.getByLabel('차량 리스트').locator('tr', { hasText: plate });
  await expect(vehicleRow).toBeVisible();
  await vehicleRow.click();

  const assignment = page.getByLabel('배송원 배정');
  await assignment.getByLabel('배송원 선택').selectOption({ label: driverName });
  await assignment.getByRole('button', { name: '배정', exact: true }).click();
  await expect(assignment.locator('tr', { hasText: driverName })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '차량', exact: true }).click();
  await page.getByLabel('차량 리스트').locator('tr', { hasText: plate }).click();
  await expect(page.getByLabel('배송원 배정').locator('tr', { hasText: driverName })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '차량 삭제', exact: true }).click();
  await expect(page.getByLabel('차량 리스트').locator('tr', { hasText: plate })).toHaveCount(0);
  await page.getByRole('button', { name: '배송원', exact: true }).click();
  await page.getByLabel('배송원 리스트').locator('tr', { hasText: driverName }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '배송원 삭제', exact: true }).click();
  await expect(page.getByLabel('배송원 리스트').locator('tr', { hasText: driverName })).toHaveCount(0);
});
