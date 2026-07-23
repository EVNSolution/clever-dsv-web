import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function openScope(page, scope, resource) {
  await page.goto('/master-data');
  await page.getByRole('button', { name: scope, exact: true }).click();
  if (resource) await page.getByRole('button', { name: resource, exact: true }).click();
}

async function save(form) {
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0);
}

async function remove(page, name, row) {
  await row.click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: `${name} 삭제`, exact: true }).click();
}

test('driver create edit and permanent delete persist after reload', async ({ page }) => {
  const name = `배송원 ${stamp()}`;
  await openScope(page, '운송자원', '배송원');
  await expect(page.getByLabel('배송원 리스트').getByRole('button', { name: '배송원 등록', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByRole('button', { name: '배송원 수정', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('배송원 리스트').getByRole('button', { name: '배송원 삭제', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '배송원 등록', exact: true }).click();
  let form = page.getByLabel('배송원 편집');
  await form.getByLabel('이름').fill(name);
  await form.getByLabel('연령').fill('34');
  await form.getByLabel('경력').fill('배송 경력 1년');
  await form.getByLabel('담당 권역').fill('강남');
  await form.getByLabel('업무 특성').fill('정시 배송');
  await save(form);

  let row = page.getByLabel('배송원 리스트').locator('tr', { hasText: name });
  await expect(row).toBeVisible();
  await page.reload();
  row = page.getByLabel('배송원 리스트').locator('tr', { hasText: name });
  await row.click();
  await expect(page.getByLabel('배송원 상세').getByRole('button', { name: '배송원 수정', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 상세').getByRole('button', { name: '배송원 삭제', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '배송원 수정', exact: true }).click();
  form = page.getByLabel('배송원 편집');
  await form.getByLabel('이름').fill(`${name} 수정`);
  await save(form);
  row = page.getByLabel('배송원 리스트').locator('tr', { hasText: `${name} 수정` });
  await remove(page, '배송원', row);
  await page.reload();
  await expect(page.getByLabel('배송원 리스트').locator('tr', { hasText: name })).toHaveCount(0);
});

test('vehicle detail owns vehicle CRUD and driver assignment', async ({ page }) => {
  const plate = `99가 ${stamp().slice(-4)}`;
  await openScope(page, '운송자원', '차량');
  await expect(page.getByLabel('차량 리스트').getByText('차량 리스트', { exact: true })).toBeVisible();
  await expect(page.getByLabel('차량 리스트').getByRole('button', { name: '차량 등록', exact: true })).toBeVisible();
  await expect(page.getByLabel('차량 리스트').getByRole('button', { name: '차량 수정', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('차량 리스트').getByRole('button', { name: '차량 삭제', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '차량 등록', exact: true }).click();
  let form = page.getByLabel('차량 편집');
  await form.getByLabel('차량 번호').fill(plate);
  await form.getByLabel('차종').fill('냉장탑차');
  await form.getByLabel('메모').fill('회귀 테스트');
  await save(form);
  await expect(page.getByLabel('차량 리스트').locator('tr', { hasText: plate })).toBeVisible();
  await expect(page.getByLabel('운송자원 범주').getByRole('button', { name: '배정', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('차량 상세').getByRole('button', { name: '차량 수정', exact: true })).toBeVisible();
  await expect(page.getByLabel('차량 상세').getByRole('button', { name: '차량 삭제', exact: true })).toBeVisible();

  const assignment = page.getByLabel('배송원 배정');
  await assignment.getByLabel('배송원 선택').selectOption({ label: '김도윤' });
  await assignment.getByRole('button', { name: '배정', exact: true }).click();
  await expect(assignment.locator('tr', { hasText: '김도윤' })).toBeVisible();
  await assignment.getByRole('button', { name: '김도윤 배정 해제', exact: true }).click();
  await expect(assignment.locator('tr', { hasText: '김도윤' })).toHaveCount(0);

  await page.getByRole('button', { name: '차량 수정', exact: true }).click();
  form = page.getByLabel('차량 편집');
  await form.getByLabel('메모').fill('수정 완료');
  await save(form);
  const row = page.getByLabel('차량 리스트').locator('tr', { hasText: plate });
  await expect(row).toContainText('수정 완료');
  await remove(page, '차량', row);
  await expect(page.getByLabel('차량 리스트').locator('tr', { hasText: plate })).toHaveCount(0);
});

test('customer with zero orders persists', async ({ page }) => {
  const name = `고객사 ${stamp()}`;
  await openScope(page, '고객사');
  await page.getByRole('button', { name: '고객사 등록', exact: true }).click();
  const form = page.getByLabel('고객사 편집');
  await form.getByLabel('고객사명').fill(name);
  await form.getByLabel('고객 코드').fill(`C-${stamp()}`);
  await save(form);
  const row = page.locator('.master-customer-table tr', { hasText: name });
  await expect(row).toContainText('0건');
  await expect(row.getByText('배송조회', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.locator('.master-customer-table tr', { hasText: name })).toContainText('0건');
});

test('stale management views preserve unrelated changes', async ({ page, context }) => {
  const otherPage = await context.newPage();
  const driverName = `병합 배송원 ${stamp()}`;
  const customerName = `병합 고객사 ${stamp()}`;
  await openScope(page, '운송자원', '배송원');
  await openScope(otherPage, '고객사');

  await page.getByRole('button', { name: '배송원 등록', exact: true }).click();
  const driverForm = page.getByLabel('배송원 편집');
  await driverForm.getByLabel('이름').fill(driverName);
  await driverForm.getByLabel('연령').fill('32');
  await driverForm.getByLabel('경력').fill('배송 경력 1년');
  await driverForm.getByLabel('담당 권역').fill('서울');
  await save(driverForm);

  await otherPage.getByRole('button', { name: '고객사 등록', exact: true }).click();
  const customerForm = otherPage.getByLabel('고객사 편집');
  await customerForm.getByLabel('고객사명').fill(customerName);
  await customerForm.getByLabel('고객 코드').fill(`M-${stamp()}`);
  await save(customerForm);

  await page.reload();
  await expect(page.getByLabel('배송원 리스트').locator('tr', { hasText: driverName })).toBeVisible();
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.locator('.master-customer-table tr', { hasText: customerName })).toBeVisible();
});

test('destination suggests similar addresses and allows manual same-place linking', async ({ page }) => {
  await openScope(page, '고객사');
  await page.getByRole('button', { name: '배송지 등록', exact: true }).click();
  let form = page.getByLabel('배송지 편집');
  const name = `배송지 ${stamp()}`;
  await form.getByLabel('배송지명').fill(name);
  await form.getByLabel('주소', { exact: true }).fill('서울특별시 강남구 테헤란로 152');
  await expect(form.getByText('유사 주소 후보')).toBeVisible();
  await form.getByLabel('동일 배송지').selectOption({ index: 1 });
  await save(form);
  let row = page.locator('.master-destination-table tr', { hasText: name });
  await expect(row).toContainText('연결');
  await row.click();
  await page.getByRole('button', { name: '배송지 수정', exact: true }).click();
  form = page.getByLabel('배송지 편집');
  await form.getByLabel('배송지명').fill(`${name} 수정`);
  await save(form);
  row = page.locator('.master-destination-table tr', { hasText: `${name} 수정` });
  await remove(page, '배송지', row);
  await expect(page.locator('.master-destination-table tr', { hasText: name })).toHaveCount(0);
});

test('condition keeps create and delete on the list and edit on the detail', async ({ page }) => {
  const name = `조건 ${stamp()}`;
  await openScope(page, '운송조건');
  const listPanel = page.locator('.master-condition-grid > .page-panel').first();
  const detailPanel = page.locator('.master-condition-grid > .page-panel').nth(1);
  await expect(listPanel.getByRole('button', { name: '운송조건 등록', exact: true })).toBeVisible();
  await expect(listPanel.getByRole('button', { name: '운송조건 삭제', exact: true })).toBeVisible();
  await expect(listPanel.getByRole('button', { name: '운송조건 수정', exact: true })).toHaveCount(0);
  await expect(detailPanel.getByRole('button', { name: '운송조건 수정', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '운송조건 등록', exact: true }).click();
  let form = page.getByLabel('운송조건 편집');
  await form.getByLabel('조건 코드').fill(`COND-${stamp().slice(-4)}`);
  await form.getByLabel('명칭').fill(name);
  await form.getByLabel('설명').fill('관리자가 등록한 운송 조건');
  await save(form);
  let row = page.locator('.master-condition-grid tr', { hasText: name });
  await row.click();
  await page.getByRole('button', { name: '운송조건 수정', exact: true }).click();
  form = page.getByLabel('운송조건 편집');
  await form.getByLabel('명칭').fill(`${name} 수정`);
  await save(form);
  await page.reload();
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.locator('.master-condition-grid tr', { hasText: `${name} 수정` })).toBeVisible();
  await page.locator('.master-condition-grid tr', { hasText: `${name} 수정` }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '운송조건 삭제', exact: true }).click();
  await expect(page.locator('.master-condition-grid tr', { hasText: `${name} 수정` })).toHaveCount(0);
});

test('dispatch condition inspection keeps source casing and registers explicit candidates', async ({ page }) => {
  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: readFileSync(new URL('../../public/examples/dsv-fixed-dispatch-10.csv', import.meta.url)),
    mimeType: 'text/csv',
    name: 'dsv-fixed-dispatch-10.csv',
  });
  await expect(page.getByRole('button', { name: '사전 검사', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '사전 검사', exact: true }).click();

  await expect(page.locator('.condition-candidate')).toHaveCount(2);
  await expect(page.locator('.condition-candidate').filter({ hasText: 'Cold' })).toBeVisible();
  await expect(page.locator('.condition-candidate').filter({ hasText: 'Ambient' })).toBeVisible();
  await expect(page.locator('.dispatch-upload-summary')).toContainText('10');
  const cold = page.locator('.condition-candidate').filter({ hasText: 'Cold' });
  await cold.getByLabel('명칭').fill('냉장 원문');
  await cold.getByLabel('설명').fill('원문 대소문자를 유지한 등록 후보');
  await cold.getByRole('button', { name: '등록', exact: true }).click();
  const ambient = page.locator('.condition-candidate').filter({ hasText: 'Ambient' });
  await ambient.getByLabel('명칭').fill('상온 원문');
  await ambient.getByLabel('설명').fill('상온 원문 조건');
  await ambient.getByRole('button', { name: '등록', exact: true }).click();
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '업로드 확정', exact: true }).click();
  await expect(page.getByText('10건 업로드 완료')).toBeVisible();

  await page.goto('/master-data');
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Cold', exact: true })).toBeVisible();
  await expect(page.locator('.master-condition-grid tr', { hasText: '냉장 원문' })).toBeVisible();
});

test('multiple driver assignments remain visible for one vehicle after reload', async ({ page }) => {
  const plate = `88다 ${stamp().slice(-4)}`;
  await openScope(page, '운송자원', '차량');
  await page.getByRole('button', { name: '차량 등록', exact: true }).click();
  const form = page.getByLabel('차량 편집');
  await form.getByLabel('차량 번호').fill(plate);
  await form.getByLabel('차종').fill('냉장탑차');
  await form.getByLabel('메모').fill('다중 배정 회귀');
  await save(form);

  const assignment = page.getByLabel('배송원 배정');
  await assignment.getByLabel('배송원 선택').selectOption({ label: '김도윤' });
  await assignment.getByRole('button', { name: '배정', exact: true }).click();
  await assignment.getByLabel('배송원 선택').selectOption({ label: '이서연' });
  await assignment.getByRole('button', { name: '배정', exact: true }).click();
  await expect(assignment.locator('tbody tr')).toHaveCount(2);
  await expect(assignment.locator('tr', { hasText: '김도윤' })).toBeVisible();
  await expect(assignment.locator('tr', { hasText: '이서연' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '차량', exact: true }).click();
  const row = page.getByLabel('차량 리스트').locator('tr', { hasText: plate });
  await row.click();
  const reloadedAssignment = page.getByLabel('배송원 배정');
  await expect(reloadedAssignment.locator('tbody tr')).toHaveCount(2);
  await expect(reloadedAssignment.locator('tr', { hasText: '김도윤' })).toBeVisible();
  await expect(reloadedAssignment.locator('tr', { hasText: '이서연' })).toBeVisible();

  await remove(page, '차량', row);
  await expect(page.getByLabel('차량 리스트').locator('tr', { hasText: plate })).toHaveCount(0);
});
