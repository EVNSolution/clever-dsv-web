import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

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
  const deleteButton = page.getByRole('button', { name: `${name} 삭제`, exact: true });
  if (!(await deleteButton.isEnabled())) await row.click();
  page.once('dialog', (dialog) => dialog.accept());
  await deleteButton.click();
}

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

test('stale management views preserve unrelated customer and condition changes', async ({ page, context }) => {
  const otherPage = await context.newPage();
  const customerName = `병합 고객사 ${stamp()}`;
  const conditionName = `병합 조건 ${stamp()}`;
  await openScope(page, '고객사');
  await openScope(otherPage, '운송조건');

  await page.getByRole('button', { name: '고객사 등록', exact: true }).click();
  const customerForm = page.getByLabel('고객사 편집');
  await customerForm.getByLabel('고객사명').fill(customerName);
  await customerForm.getByLabel('고객 코드').fill(`A-${stamp()}`);
  await save(customerForm);

  await otherPage.getByRole('button', { name: '운송조건 등록', exact: true }).click();
  const conditionForm = otherPage.getByLabel('운송조건 편집');
  await conditionForm.getByLabel('조건 코드').fill(`B-${stamp()}`);
  await conditionForm.getByLabel('명칭').fill(conditionName);
  await conditionForm.getByLabel('설명').fill('병합 회귀 조건');
  await save(conditionForm);

  await page.reload();
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.locator('.master-customer-table tr', { hasText: customerName })).toBeVisible();
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.locator('.master-condition-grid tr', { hasText: conditionName })).toBeVisible();
});

test('destination suggests similar addresses and allows manual same-place linking', async ({ page }) => {
  await openScope(page, '고객사');
  await page.getByRole('button', { name: '고객사 등록', exact: true }).click();
  let form = page.getByLabel('고객사 편집');
  await form.getByLabel('고객사명').fill(`배송지 고객사 ${stamp()}`);
  await form.getByLabel('고객 코드').fill(`DEST-${stamp()}`);
  await save(form);

  await page.getByRole('button', { name: '배송지 등록', exact: true }).click();
  form = page.getByLabel('배송지 편집');
  await form.getByLabel('배송지명').fill('기준 배송지');
  await form.getByLabel('주소', { exact: true }).fill('서울 강남구 테헤란로 152');
  await save(form);

  await page.getByRole('button', { name: '배송지 등록', exact: true }).click();
  form = page.getByLabel('배송지 편집');
  const name = `배송지 ${stamp()}`;
  await form.getByLabel('배송지명').fill(name);
  await form.getByLabel('주소', { exact: true }).fill('서울특별시 강남구 테헤란로 152');
  await expect(form.getByText('유사 주소 후보')).toBeVisible();
  await form.getByLabel('동일 배송지').selectOption({ index: 1 });
  await save(form);
  let row = page.locator('.master-destination-table tr', { hasText: name });
  await expect(row).toContainText('연결');
  await page.getByRole('button', { name: '배송지 수정', exact: true }).click();
  form = page.getByLabel('배송지 편집');
  await form.getByLabel('배송지명').fill(`${name} 수정`);
  await save(form);
  row = page.locator('.master-destination-table tr', { hasText: `${name} 수정` });
  await remove(page, '배송지', row);
  await expect(page.locator('.master-destination-table tr', { hasText: name })).toHaveCount(0);
});

test('customer and destination follow the condition CRUD placement contract', async ({ page }) => {
  await openScope(page, '고객사');
  await page.getByRole('button', { name: '고객사 등록', exact: true }).click();
  let form = page.getByLabel('고객사 편집');
  await form.getByLabel('고객사명').fill(`구조 고객사 ${stamp()}`);
  await form.getByLabel('고객 코드').fill(`STRUCT-${stamp()}`);
  await save(form);

  const workspaces = page.locator('.management-network-shell > .resource-workspace');
  await expect(workspaces).toHaveCount(2);
  const customerList = workspaces.nth(0).locator('.management-list-panel');
  const customerDetail = workspaces.nth(0).locator('.management-detail-panel');
  await expect(customerList.getByRole('button', { name: '고객사 등록', exact: true })).toBeVisible();
  await expect(customerList.getByRole('button', { name: '고객사 삭제', exact: true })).toBeVisible();
  await expect(customerList.getByRole('button', { name: '고객사 수정', exact: true })).toHaveCount(0);
  await expect(customerDetail.getByRole('button', { name: '고객사 수정', exact: true })).toBeVisible();
  const customerClear = customerDetail.getByRole('button', { name: '선택 취소', exact: true });
  await expect(customerClear.locator('svg')).toBeVisible();
  await expect(customerClear).toHaveText('');

  await customerList.getByRole('button', { name: '고객사 등록', exact: true }).click();
  form = page.getByLabel('고객사 편집');
  await expect(form.getByRole('button', { name: '취소', exact: true })).toBeVisible();
  await expect(form.getByRole('button', { name: '저장', exact: true })).toBeVisible();
  await form.getByRole('button', { name: '취소', exact: true }).click();

  const destinationList = workspaces.nth(1).locator('.management-list-panel');
  const destinationDetail = workspaces.nth(1).locator('.management-detail-panel');
  await destinationList.getByRole('button', { name: '배송지 등록', exact: true }).click();
  form = page.getByLabel('배송지 편집');
  await form.getByLabel('배송지명').fill(`구조 배송지 ${stamp()}`);
  await form.getByLabel('주소', { exact: true }).fill('서울특별시 중구 세종대로 110');
  await save(form);
  await expect(destinationList.getByRole('button', { name: '배송지 등록', exact: true })).toBeVisible();
  await expect(destinationList.getByRole('button', { name: '배송지 삭제', exact: true })).toBeVisible();
  await expect(destinationList.getByRole('button', { name: '배송지 수정', exact: true })).toHaveCount(0);
  await expect(destinationDetail.getByRole('button', { name: '배송지 수정', exact: true })).toBeVisible();
  await expect(destinationDetail.getByRole('button', { name: '선택 취소', exact: true }).locator('svg')).toBeVisible();

  const gaps = await page.locator('.management-list-panel').evaluateAll((panels) => panels.map((panel) => {
    const heading = panel.querySelector('.admin-section-header')?.getBoundingClientRect();
    const table = panel.querySelector('.admin-table-frame')?.getBoundingClientRect();
    return heading && table ? Math.round(table.top - heading.bottom) : null;
  }));
  expect(gaps).toEqual([8, 8]);
});

test('resources keep create and delete on lists and edit on details', async ({ page }) => {
  await openScope(page, '운송자원');

  const driverWorkspace = page.getByLabel('배송원 관리');
  const driverList = driverWorkspace.getByLabel('배송원 리스트');
  const driverDetail = driverWorkspace.getByLabel('배송원 상세');
  await expect(driverList.getByRole('button', { name: '앱 설치 안내', exact: true })).toBeVisible();
  await driverList.getByRole('button', { name: '앱 설치 안내', exact: true }).click();
  const installDialog = page.getByRole('dialog', { name: '배송원 앱 안내' });
  await expect(installDialog.getByLabel('배송원 앱 설치 링크 QR 코드', { exact: true })).toHaveCount(0);
  await expect(installDialog.getByLabel('배송원 앱 설치 링크', { exact: true })).toHaveValue(
    'https://dsv.cleversystem.ai/driver-app',
  );
  await expect(installDialog.getByRole('link', { name: '설치 페이지 열기', exact: true })).toHaveAttribute(
    'href',
    'https://dsv.cleversystem.ai/driver-app',
  );
  await expect(installDialog).toContainText('일회용 초대 링크는 필요하지 않습니다.');
  await expect(installDialog).toContainText('이름과 연락처가 일치하면 배송 업무가 자동으로 연결됩니다.');
  await installDialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(driverList.getByRole('button', { name: '배송원 등록', exact: true })).toBeVisible();
  await expect(driverList.getByRole('button', { name: '배송원 삭제', exact: true })).toBeDisabled();
  await expect(driverList.getByRole('button', { name: '배송원 수정', exact: true })).toHaveCount(0);
  await driverList.getByRole('button', { name: '배송원 등록', exact: true }).click();
  const driverName = `배송원 ${stamp()}`;
  let form = page.getByLabel('배송원 편집');
  await form.getByLabel('이름').fill(driverName);
  await form.getByLabel('연락처').fill('010-1234-5678');
  await save(form);
  await expect(driverDetail.getByRole('button', { name: '배송원 수정', exact: true })).toBeVisible();
  await expect(driverList.getByRole('button', { name: '배송원 삭제', exact: true })).toBeEnabled();
  const driverClear = driverDetail.getByRole('button', { name: '선택 취소', exact: true });
  await expect(driverClear.locator('svg')).toBeVisible();
  await expect(driverClear).toHaveText('');

  const vehicleWorkspace = page.getByLabel('차량 관리');
  const vehicleList = vehicleWorkspace.getByLabel('차량 리스트');
  const vehicleDetail = vehicleWorkspace.getByLabel('차량 상세');
  await expect(vehicleList.getByRole('button', { name: '차량 등록', exact: true })).toBeVisible();
  await expect(vehicleList.getByRole('button', { name: '차량 삭제', exact: true })).toBeDisabled();
  await expect(vehicleList.getByRole('button', { name: '차량 수정', exact: true })).toHaveCount(0);
  await vehicleList.getByRole('button', { name: '차량 등록', exact: true }).click();
  form = page.getByLabel('차량 편집');
  await form.getByLabel('차량 번호').fill('서울80바1234');
  await form.getByLabel('차종').fill('냉장탑차');
  await save(form);
  await expect(vehicleDetail.getByRole('button', { name: '차량 수정', exact: true })).toBeVisible();
  await expect(vehicleList.getByRole('button', { name: '차량 삭제', exact: true })).toBeEnabled();
  await expect(vehicleDetail).toContainText('기본 배송원');
  await vehicleDetail.getByLabel('배정할 배송원').selectOption({ index: 1 });
  await vehicleDetail.getByRole('button', { name: '배정', exact: true }).click();
  await expect(vehicleDetail).toContainText(driverName);
  const assignedDriverSelect = vehicleDetail.getByLabel('배정할 배송원');
  await expect(assignedDriverSelect).toBeDisabled();
  await expect(assignedDriverSelect.locator('option:checked')).toHaveText(driverName);
  await expect(vehicleDetail.getByRole('button', { name: '배정', exact: true })).toBeDisabled();
  await expect(vehicleDetail.getByRole('button', { name: '해제', exact: true })).toBeEnabled();
  await expect(driverList.locator('tbody tr').first()).toContainText('서울80바1234');
  await vehicleDetail.getByRole('button', { name: '해제', exact: true }).click();
  await expect(vehicleDetail.getByRole('button', { name: '해제', exact: true })).toBeDisabled();
  await expect(driverList.locator('tbody tr').first()).toContainText('-');
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
  await form.getByLabel('온도 알림 사용').check();
  await form.getByLabel('최소 ℃').fill('8');
  await form.getByLabel('최대 ℃').fill('2');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('온도 최소값');
    dialog.accept();
  });
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toBeVisible();
  await form.getByLabel('최소 ℃').fill('2');
  await form.getByLabel('최대 ℃').fill('8');
  await save(form);
  let row = page.locator('.master-condition-grid tr', { hasText: name });
  await row.click();
  await expect(detailPanel).toContainText('온도 알림');
  await expect(detailPanel).toContainText('사용');
  await expect(detailPanel).toContainText('2℃ - 8℃');
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
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeDisabled();
  await expect(page.locator('.dispatch-upload-issues')).toContainText('등록된 배송원을 찾을 수 없습니다.');
  await expect(page.locator('.dispatch-upload-issues')).toContainText('등록된 차량 번호를 찾을 수 없습니다.');
  for (const name of ['김도윤', '이서연', '박민재']) {
    const candidate = page.locator('.driver-candidate').filter({ hasText: name });
    await candidate.getByRole('button', { name: '배송원 등록', exact: true }).click();
    await expect(candidate).toHaveCount(0);
  }
  for (const plate of ['21사 6101', '12바 2302', '13사 3403']) {
    const candidate = page.locator('.vehicle-candidate').filter({ hasText: plate });
    await candidate.getByRole('button', { name: '차량 등록', exact: true }).click();
    await expect(candidate).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();

  await page.goto('/master-data');
  await page.getByRole('button', { name: '운송자원', exact: true }).click();
  await expect(page.getByLabel('배송원 리스트').locator('tr', { hasText: '김도윤' })).toBeVisible();
  await expect(page.getByLabel('차량 리스트').locator('tr', { hasText: '21사 6101' })).toBeVisible();
  await page.getByRole('button', { name: '운송조건', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Cold', exact: true })).toBeVisible();
  await expect(page.locator('.master-condition-grid tr', { hasText: '냉장 원문' })).toBeVisible();
});

test('dispatch accepts an XLSX workbook through the same inspection flow', async ({ page }) => {
  const csv = readFileSync(new URL('../../public/examples/dsv-fixed-dispatch-10.csv', import.meta.url), 'utf8');
  const workbook = XLSX.read(csv, { type: 'string' });
  const xlsx = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: xlsx,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: 'dsv-fixed-dispatch-10.xlsx',
  });

  await expect(page.getByText('dsv-fixed-dispatch-10.xlsx', { exact: true })).toBeVisible();
  await expect(page.locator('.dispatch-upload-summary')).toContainText('10');
  await expect(page.locator('.condition-candidate')).toHaveCount(2);
});

test('dispatch infers the plan date from the fixed-dispatch workbook filename', async ({ page }) => {
  const csv = readFileSync(new URL('../../public/examples/dsv-fixed-dispatch-10.csv', import.meta.url), 'utf8');
  const workbook = XLSX.read(csv, { type: 'string' });
  const xlsx = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: xlsx,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: '고정차량배차리스트_260715.xlsx',
  });

  await expect(page.getByLabel('배차일', { exact: true })).toHaveValue('2026-07-15');
});

test('dispatch prefers a single workbook plan-date column over the filename', async ({ page }) => {
  const csv = readFileSync(new URL('../../public/examples/dsv-fixed-dispatch-10.csv', import.meta.url), 'utf8');
  const rows = XLSX.utils.sheet_to_json(XLSX.read(csv, { type: 'string' }).Sheets.Sheet1, { header: 1 });
  rows[0].push('배차일');
  for (const row of rows.slice(1)) row.push('2026-08-03');
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '배차');
  const xlsx = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: xlsx,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: '고정차량배차리스트_260715.xlsx',
  });

  await expect(page.getByLabel('배차일', { exact: true })).toHaveValue('2026-08-03');
});

test('dispatch keeps an XLSX sheet visible when required columns are missing', async ({ page }) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['customer', 'SellerOrderKey', '배송처'],
    ['DSV-HEALTH', 'ORDER-MISSING-COLUMNS', '역삼 진단센터'],
  ]), '배차');
  const xlsx = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: xlsx,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: 'missing-columns.xlsx',
  });

  const preview = page.getByRole('table', { name: '배차 시트 미리보기' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('ORDER-MISSING-COLUMNS');
  const review = page.locator('.dispatch-upload-review');
  await expect(review.getByRole('alert')).toContainText('필수 열이 없습니다');
  await expect(review.getByRole('button', { name: '업로드 확정', exact: true })).toBeDisabled();
});

test('dispatch accepts an upload without driver and vehicle columns as unassigned', async ({ page }) => {
  const csv = [
    '배송처,condition,shippedbox,주소,customer,SellerOrderKey,latitude,longitude',
    '백제약품동부,COLD,4,경기 광주시 초월읍 경충대로 1284번길 51,sanofi,2018330248,37.412,127.301',
  ].join('\n');

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: 'text/csv',
    name: 'unassigned-orders.csv',
  });

  const review = page.locator('.dispatch-upload-review');
  await expect(page.getByRole('table', { name: 'CSV 시트 미리보기' })).toContainText('2018330248');
  const issues = page.locator('details.dispatch-upload-issues');
  await expect(issues).toHaveCount(0);
  await expect(review.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
});

test('dispatch resolves a registered driver name when the vehicle column is absent', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('clever.management.data.v3', JSON.stringify({
      assignments: [{ driverId: 'driver-upload', id: 'assignment-upload', kind: '기본 배정', vehicleId: 'vehicle-upload' }],
      conditions: [{
        code: 'COLD',
        description: '냉장 상태를 유지하여 운송합니다.',
        id: 'condition-cold',
        name: '냉장 운송',
        proof: '온도기록, 인수증',
        temperature: '2-8℃',
        temperatureAlertEnabled: true,
        temperatureMaxC: 8,
        temperatureMinC: 2,
        vehicle: '냉장탑차',
      }],
      customers: [],
      destinations: [],
      drivers: [{ age: 40, career: '5년', gender: '미제공', id: 'driver-upload', name: '이교탁', score: '미제공', traits: [], zone: '미제공' }],
      vehicles: [{ id: 'vehicle-upload', note: '', plate: '12가 3456', type: '냉장탑차' }],
    }));
  });
  const csv = [
    'driver,배송처,condition,shippedbox,주소,customer,SellerOrderKey,latitude,longitude',
    '이교탁,백제약품동부,COLD,4,경기 광주시 초월읍 경충대로 1284번길 51,sanofi,DRIVER-AUTO-1,37.412,127.301',
  ].join('\n');

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: 'text/csv',
    name: 'driver-only.csv',
  });

  const review = page.locator('.dispatch-upload-review');
  await expect(page.locator('details.dispatch-upload-issues')).toHaveCount(0);
  await expect(review.getByRole('button', { name: '업로드 확정', exact: true })).toBeEnabled();
  await review.getByRole('button', { name: '업로드 확정', exact: true }).click();
  const applied = await page.evaluate(() => JSON.parse(window.localStorage.getItem('clever.dispatch.last-import') ?? 'null'));
  expect(applied.rows[0]).toMatchObject({ driverId: 'driver-upload', vehicleId: 'vehicle-upload' });
});

test('dispatch counts issue rows instead of individual issues', async ({ page }) => {
  const csv = [
    '배송처,condition,shippedbox,주소,customer,SellerOrderKey,latitude,longitude',
    ',COLD,0,,CUSTOMER-ERROR,,37.5,127.0',
  ].join('\n');

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  await page.getByLabel('배차 파일').setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: 'text/csv',
    name: 'multiple-errors-one-row.csv',
  });

  const issues = page.locator('details.dispatch-upload-issues');
  await expect(issues).toBeVisible();
  await expect(issues.locator('summary b')).toHaveText('1행');
  await expect(issues.locator('.dispatch-upload-issue-row')).toHaveCount(4);
});

test('dispatch accepts a CSV file dropped from the user computer', async ({ page }) => {
  const csv = [
    'driver,vehicle,배송처,condition,shippedbox,주소,customer,SellerOrderKey',
    '김도윤,21사 6101,역삼 진단센터,COLD,2,서울특별시 강남구 테헤란로 152,DSV-HEALTH,ORDER-DROPPED',
  ].join('\n');

  await page.goto('/dispatch');
  await page.getByRole('button', { name: '주문 업로드', exact: true }).click();
  const dropZone = page.locator('.dispatch-upload-choice');
  await dropZone.evaluate((element, source) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([source], 'dropped-dispatch.csv', { type: 'text/csv' }));
    element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  }, csv);

  await expect(page.getByText('dropped-dispatch.csv', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'CSV 시트 미리보기' })).toContainText('ORDER-DROPPED');
  await expect(page.locator('.dispatch-upload-summary')).toContainText('1');
});
