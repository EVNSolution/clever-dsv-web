import { test, expect } from '@playwright/test';
import { expectPath } from './helpers.js';

test('admin tab labels keep English paths', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar-brand-title')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'center');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '194px');
  await page.waitForTimeout(400);
  const fixedHeaderBox = await page.locator('.sidebar-brand').boundingBox();
  await expect(page.locator('.sidebar-brand')).toHaveCSS('height', '40px');
  await expect(page.locator('.map-toolbar')).toHaveCSS('height', '91px');
  await expect(page.locator('.notification-bell')).toHaveCSS('height', '52px');
  await expect(page.locator('.notification-bell svg')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('.side')).toHaveCSS('top', '20px');
  const toolbarBox = await page.locator('.map-toolbar').boundingBox();
  const bellBox = await page.locator('.notification-bell').boundingBox();
  const expandedTabsBox = await page.locator('.left-tabs').boundingBox();
  expect(toolbarBox.x).toBe(expandedTabsBox.x + expandedTabsBox.width + 12);
  expect(Math.round(bellBox.x - toolbarBox.x - toolbarBox.width)).toBe(12);
  expect(bellBox.y).toBe(toolbarBox.y);
  await page.getByLabel('알림 열기').click();
  const notificationBox = await page.locator('.notification-stack').boundingBox();
  expect(notificationBox.x).toBe(bellBox.x);
  expect(notificationBox.y).toBe(bellBox.y + bellBox.height + 12);
  expect(notificationBox.width).toBe(380);
  await page.getByLabel('알림 닫기').click();
  await expect(page.getByRole('button', { name: '사이드바 접기' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('width', '60px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('height', '40px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('font-size', '22px');
  await expect(page.locator('.main-tab.active')).toHaveCSS('height', '40px');
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toHaveText('차량과 배송지를 관제');
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toHaveCSS('font-size', '9px');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('display', 'grid');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('align-items', 'center');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'left');
  const tabCopyPositions = await page.locator('.main-tab-copy').evaluateAll((copies) => copies.map((copy) => ({
    titleX: copy.querySelector('strong')?.getBoundingClientRect().x,
    descriptionX: copy.querySelector('small')?.getBoundingClientRect().x,
  })));
  expect(new Set(tabCopyPositions.map(({ titleX }) => titleX)).size).toBe(1);
  expect(new Set(tabCopyPositions.map(({ descriptionX }) => descriptionX)).size).toBe(1);
  await expect(page.locator('.sidebar-brand-toggle')).toBeVisible();
  await expect(page.locator('.sidebar-brand-toggle')).toHaveCSS('width', '16px');
  await expect(page.locator('.sidebar-brand-toggle')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.sidebar-brand-toggle')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const expandedBrandMarkBox = await page.locator('.sidebar-brand-mark').boundingBox();
  const expandedActiveTabBox = await page.locator('.main-tab.active').boundingBox();
  const expandedBrandBox = await page.locator('.sidebar-brand').boundingBox();
  const expandedBrandTitleBox = await page.locator('.sidebar-brand-title').boundingBox();
  const expandedToggleBox = await page.locator('.sidebar-brand-toggle').boundingBox();
  expect(expandedToggleBox.x - expandedBrandTitleBox.x - expandedBrandTitleBox.width).toBeGreaterThanOrEqual(18);
  expect(expandedToggleBox.x + expandedToggleBox.width).toBeLessThanOrEqual(expandedBrandBox.x + expandedBrandBox.width);
  expect(expandedBrandMarkBox.y).toBe(expandedBrandBox.y);
  expect(expandedBrandMarkBox.y + expandedBrandMarkBox.height).toBe(expandedBrandBox.y + expandedBrandBox.height);
  expect(expandedBrandMarkBox.x).toBe(expandedActiveTabBox.x);
  const chevronSize = await page.locator('.sidebar-brand-toggle').evaluate((element) => ({ width: getComputedStyle(element, '::before').width, height: getComputedStyle(element, '::before').height }));
  expect(chevronSize).toEqual({ width: '4px', height: '4px' });
  await page.getByRole('button', { name: '사이드바 접기' }).click();
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '76px');
  await page.waitForTimeout(400);
  await expect(page.locator('.sidebar-brand-title')).not.toBeVisible();
  await expect(page.locator('.sidebar-brand-mark')).toHaveText('C');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('width', '60px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('height', '40px');
  await expect(page.locator('.sidebar-brand-toggle')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy small')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'center');
  const collapsedBrandMarkBox = await page.locator('.sidebar-brand-mark').boundingBox();
  const collapsedActiveTabBox = await page.locator('.main-tab.active').boundingBox();
  const collapsedTabsBox = await page.locator('.left-tabs').boundingBox();
  const collapsedToolbarBox = await page.locator('.map-toolbar').boundingBox();
  expect(collapsedToolbarBox.x).toBe(collapsedTabsBox.x + collapsedTabsBox.width + 12);
  expect(collapsedBrandMarkBox.x).toBe(collapsedActiveTabBox.x);
  expect(collapsedBrandMarkBox.x).toBe(expandedBrandMarkBox.x);
  expect(collapsedActiveTabBox.x).toBe(expandedActiveTabBox.x);
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '194px');
  await page.waitForTimeout(400);
  await expect(page.locator('.sidebar-brand-title')).toHaveText('CLEVER DSV');
  await expect(page.locator('.sidebar-brand')).toHaveCSS('width', '182px');
  await expect(page.locator('.tab-icon')).toHaveCount(0);
  await expect(page.locator('.brand-copy small')).toHaveCount(0);
  await expect(page.locator('html')).toHaveCSS('font-family', /Pretendard Variable/);
  for (const name of ['포인트', '마커', '2D', '3D']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCSS('height', '28px');
    await expect(page.getByRole('button', { name, exact: true })).toHaveCSS('font-size', '12px');
    await expect(page.getByRole('button', { name, exact: true })).toHaveCSS('font-weight', '800');
  }

  for (const [tab, path] of [
    ['배차', '/dispatch'],
    ['이력', '/records'],
    ['관리', '/master-data'],
    ['설정', '/settings'],
  ]) {
    await page.getByRole('link', { name: tab }).click();
    await expectPath(page, path);
    await expect(page.locator('h1', { hasText: 'CLEVER DSV' })).toBeVisible();
    await expect(page.getByRole('heading', { name: tab })).toBeVisible();
    const currentHeaderBox = await page.locator('.sidebar-brand').boundingBox();
    expect(currentHeaderBox.width).toBe(fixedHeaderBox.width);
    expect(currentHeaderBox.height).toBe(fixedHeaderBox.height);
    expect(Math.abs(currentHeaderBox.x - fixedHeaderBox.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(currentHeaderBox.y - fixedHeaderBox.y)).toBeLessThanOrEqual(2);
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await expect(page.locator('main.page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByText(/Demo|Simulation/)).toHaveCount(0);
  }
});
test('all primary interactive buttons mutate visible UI state', async ({ page }) => {
  await page.goto('/control');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const expandedDestinationY = (await page.locator('#destinationCard').boundingBox()).y;
  await page.evaluate(() => { window.__initialMapCanvas = document.querySelector('.maplibregl-canvas'); });

  await page.getByRole('button', { name: '포인트' }).click();
  await expect(page.getByRole('button', { name: '포인트' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: '3D' }).click();
  await expect(page.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.querySelector('.maplibregl-canvas') === window.__initialMapCanvas)).toBe(true);

  await expect(page.locator('.notification-count')).toHaveText('3');
  await page.getByLabel('알림 열기').click();
  await expect(page.getByText('알림 센터')).toBeVisible();
  await expect(page.getByText('차량 이상과 배송 진행 상태를 확인하세요.')).toBeVisible();
  await expect(page.getByText('읽지 않은 알림 3건')).toBeVisible();
  const temperatureNotification = page.locator('[data-notification-id="temperature"]');
  await temperatureNotification.getByRole('button', { name: '읽음' }).click();
  await expect(page.getByText('읽지 않은 알림 2건')).toBeVisible();
  await expect(page.locator('.notification-count')).toHaveText('2');
  await expect(temperatureNotification).toHaveClass(/read/);
  const delayNotification = page.locator('[data-notification-id="delay"]');
  await delayNotification.getByRole('button', { name: '차량 조회' }).click();
  await expect(page.getByText('알림 센터')).not.toBeVisible();
  const lookedUpVehicle = page.locator('.row').filter({ hasText: '32바 7207' });
  await expect(lookedUpVehicle).toHaveAttribute('aria-pressed', 'true');
  await expect(lookedUpVehicle).toBeInViewport();
  await expect(page.getByLabel('차량 온도 변화')).toBeVisible();
  await expect(page.locator('#destinationList').getByText('한림대학교성심병원')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('.maplibregl-canvas') === window.__initialMapCanvas)).toBe(true);
  await expect(page.locator('.notification-count')).toHaveText('1');
  await page.getByLabel('알림 열기').click();
  await page.getByRole('button', { name: '전부 읽음' }).click();
  await expect(page.getByText('읽지 않은 알림 0건')).toBeVisible();
  await expect(page.locator('.notification-count')).toBeHidden();
  await page.getByLabel('알림 닫기').click();
  await page.reload();
  await expect(page.locator('.notification-count')).toBeHidden();

  await page.getByRole('button', { name: '온도', exact: true }).click();
  await expect(page.getByLabel('차량 온도 변화')).toBeVisible();
  await expect(page.getByRole('button', { name: '닫기' }).first()).toBeVisible();

  await page.getByRole('button', { name: '노트', exact: true }).click();
  await expect(page.getByLabel('배송지 노트')).toBeVisible();

  await page.getByRole('button', { name: '접기', exact: true }).click();
  await page.waitForTimeout(100);
  expect((await page.locator('#destinationCard').boundingBox()).y).toBe(expandedDestinationY);
  await expect(page.getByRole('button', { name: '펼치기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '펼치기', exact: true }).click();
  await expect(page.getByRole('button', { name: '접기', exact: true })).toBeVisible();

  await expect(page.getByText(/Demo|Simulation/)).toHaveCount(0);

  await page.goto('/master-data');
  await page.locator('[data-courier-id="c02"]').click();
  await expect(page.getByLabel('배송원 상세').getByText('이서연')).toBeVisible();
  await expect(page.getByLabel('배송원 상세').getByText('검체 운송 4년')).toBeVisible();

  await page.goto('/dispatch');
  await page.getByRole('button', { name: /이서연/ }).click();
  await expect(page.getByLabel('선택 배송 상세').getByText('1. 서울월드컵경기장', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /홍대입구역/ }).click();
  await expect(page.getByLabel('선택 배송 상세').getByText('3. 홍대입구역')).toBeVisible();
  await expect(page.getByRole('button', { name: '실시간 트레킹' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '새로고침' })).toHaveCount(0);
  await page.getByRole('button', { name: '주문 업로드' }).click();
  await expect(page.getByText('업로드 사전 검사')).toBeVisible();
  await page.getByRole('button', { name: '닫기' }).click();
  await page.getByRole('button', { name: '수정' }).click();
  await expect(page.getByText('배송 시간, 배정 배송원, 물품 수량을 수정합니다.')).toBeVisible();
  await page.locator('.work-detail-feedback').getByRole('button', { name: '저장' }).click();
  await page.getByRole('button', { name: '삭제' }).click();
  await expect(page.getByText('주문을 삭제 대기 상태로 바꿉니다.')).toBeVisible();

  await page.goto('/master-data');
  await page.getByRole('button', { name: '고객사' }).click();
  await page.getByRole('link', { name: 'CLEVER - 고객사 Demo 배송조회' }).click();
  await expectPath(page, '/customer/delivery-inquiry');
  await page.getByLabel('배송조회 날짜').getByRole('button', { name: /전일/ }).click();
  await page.getByRole('button', { name: /DSV-2026-0709-02/ }).click();
  await expect(page.getByText('인천 항공 긴급배송', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /CR-330/ }).click();
  await expect(page.getByText('항공 특송 서류함', { exact: true })).toBeVisible();
});

test('notification vehicle lookup opens and reveals the vehicle from another tab', async ({ page }) => {
  await page.goto('/dispatch');
  await page.getByLabel('알림 열기').click();
  await page.locator('[data-notification-id="proof"]').getByRole('button', { name: '차량 조회' }).click();

  await expect(page).toHaveURL(/\/control$/);
  await expect(page.getByText('알림 센터')).not.toBeVisible();
  const vehicle = page.locator('[data-vehicle-id="proof11"]');
  await expect(vehicle).toHaveAttribute('aria-pressed', 'true');
  await expect(vehicle).toBeInViewport();
  await expect(vehicle).toBeFocused();
  await expect(page.getByLabel('차량 온도 변화')).toBeVisible();
});

test('control detail panels use explicit no-device state and selected destination context', async ({ page }) => {
  await page.goto('/control');

  await page.getByRole('button', { name: '온도', exact: true }).click();
  const temperature = page.getByLabel('차량 온도 변화');
  await expect(temperature.getByText('단말기 미설치')).toBeVisible();
  await expect(temperature.getByText('4.8℃')).toHaveCount(0);

  await page.locator('[data-delivery-stop-id="demo:depart01:1"]').click();
  await page.getByRole('button', { name: '노트', exact: true }).click();
  const note = page.getByLabel('배송지 노트');
  await expect(note.getByText('강남역 메모')).toBeVisible();
  await expect(note.getByRole('heading', { name: '배송 품목' })).toBeVisible();
  await expect(note.getByText('후문 하역장 이용')).toBeVisible();

  await page.locator('[data-delivery-stop-id="demo:depart01:2"]').click();
  await expect(note.getByText('역삼역 메모')).toBeVisible();
  await expect(note.getByText('등록된 배송지 팁이 없습니다.')).toBeVisible();
  await expect(page.locator('[data-delivery-stop-id="demo:depart01:2"]')).toHaveAttribute('aria-pressed', 'true');
});
