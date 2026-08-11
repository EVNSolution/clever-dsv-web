import { test, expect } from '@playwright/test';
import { expectPath } from './helpers.js';

test('admin shell navigation preserves its geometry across English routes', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar-brand-title')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.locator('.sidebar-logout svg')).toBeVisible();
  await expect(page.locator('.sidebar-logout')).toHaveCSS('height', '40px');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '206px');
  await expect(page.locator('.left-tabs')).toHaveCSS('border-right-color', 'rgb(72, 72, 74)');
  const fixedHeaderBox = await page.locator('.sidebar-brand').boundingBox();
  await expect(page.locator('.sidebar-brand')).toHaveCSS('height', '40px');
  await expect(page.locator('.sidebar-logout')).toHaveCSS('height', '40px');
  await expect(page.locator('.notification-bell')).toHaveCSS('height', '52px');
  await expect(page.locator('.notification-bell')).toHaveCSS('border-color', 'rgb(229, 229, 234)');
  await expect(page.locator('.notification-bell svg')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('#vehicleCard')).toHaveCSS('border-color', 'rgb(229, 229, 234)');
  await expect(page.locator('#customerCard')).toHaveCSS('border-color', 'rgb(229, 229, 234)');
  await expect(page.locator('.side')).toHaveCSS('top', '20px');
  const bellBox = await page.locator('.notification-bell').boundingBox();
  const expandedTabsBox = await page.locator('.left-tabs').boundingBox();
  expect(bellBox.x).toBe(expandedTabsBox.x + expandedTabsBox.width + 12);
  expect(bellBox.y).toBe(expandedTabsBox.y);
  await page.getByLabel('알림 열기').click();
  await expect(page.locator('.notification-stack')).toHaveCSS('border-color', 'rgb(229, 229, 234)');
  const notificationBox = await page.locator('.notification-stack').boundingBox();
  expect(notificationBox.x).toBe(bellBox.x);
  expect(notificationBox.y).toBe(bellBox.y + bellBox.height + 12);
  expect(notificationBox.width).toBe(380);
  await page.getByLabel('알림 닫기').click();
  await expect(page.getByRole('button', { name: '사이드바 접기', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('width', '60px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('height', '40px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('font-size', '22px');
  await expect(page.locator('.main-tab.active')).toHaveCSS('height', '40px');
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toHaveText('차량과 배송지 관제');
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toHaveCSS('font-size', '11px');
  await expect(page.locator('.main-tab.active .main-tab-copy small')).toHaveCSS('color', 'rgba(255, 255, 255, 0.86)');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('display', 'grid');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('align-items', 'center');
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'left');
  const tabCopyPositions = await page.locator('.main-tab-copy').evaluateAll((copies) => copies.map((copy) => ({
    titleX: copy.querySelector('strong')?.getBoundingClientRect().x,
    descriptionX: copy.querySelector('small')?.getBoundingClientRect().x,
  })));
  expect(new Set(tabCopyPositions.map(({ titleX }) => titleX)).size).toBe(1);
  expect(new Set(tabCopyPositions.map(({ descriptionX }) => descriptionX)).size).toBe(1);
  const expandedBrandMarkBox = await page.locator('.sidebar-brand-mark').boundingBox();
  const expandedActiveTabBox = await page.locator('.main-tab.active').boundingBox();
  const expandedBrandBox = await page.locator('.sidebar-brand').boundingBox();
  const expandedRailBox = await page.locator('.sidebar-collapse-rail').boundingBox();
  expect(expandedRailBox.width).toBe(12);
  expect(expandedRailBox.height).toBe(expandedTabsBox.height);
  expect(expandedRailBox.x + expandedRailBox.width).toBe(expandedTabsBox.x + expandedTabsBox.width);
  expect(Math.abs(
    (expandedActiveTabBox.x - expandedTabsBox.x)
    - (expandedRailBox.x - (expandedActiveTabBox.x + expandedActiveTabBox.width)),
  )).toBeLessThanOrEqual(2);
  expect(expandedRailBox.y).toBe(expandedTabsBox.y);
  expect(expandedBrandMarkBox.y).toBe(expandedBrandBox.y);
  expect(expandedBrandMarkBox.y + expandedBrandMarkBox.height).toBe(expandedBrandBox.y + expandedBrandBox.height);
  expect(expandedBrandMarkBox.x).toBe(expandedActiveTabBox.x);
  await page.getByRole('button', { name: 'C 버튼으로 사이드바 접기' }).click();
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '76px');
  await expect(page.locator('.sidebar-brand-title')).not.toBeVisible();
  await expect(page.locator('.sidebar-brand-mark')).toHaveText('C');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('width', '60px');
  await expect(page.locator('.sidebar-brand-mark')).toHaveCSS('height', '40px');
  await expect(page.locator('.sidebar-collapse-rail')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy small')).not.toBeVisible();
  await expect(page.locator('.main-tab.active .main-tab-copy')).toHaveCSS('text-align', 'center');
  const collapsedBrandMarkBox = await page.locator('.sidebar-brand-mark').boundingBox();
  const collapsedActiveTabBox = await page.locator('.main-tab.active').boundingBox();
  const collapsedTabsBox = await page.locator('.left-tabs').boundingBox();
  const collapsedBellBox = await page.locator('.notification-bell').boundingBox();
  expect(collapsedBellBox.x).toBe(collapsedTabsBox.x + collapsedTabsBox.width + 12);
  expect(collapsedBrandMarkBox.x).toBe(collapsedActiveTabBox.x);
  expect(collapsedBrandMarkBox.x).toBe(expandedBrandMarkBox.x);
  expect(collapsedActiveTabBox.x).toBe(expandedActiveTabBox.x);
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await expect(page.locator('.left-tabs')).toHaveCSS('width', '206px');
  await expect(page.locator('.sidebar-brand-title')).toHaveText('CLEVER DSV');
  await expect(page.locator('.sidebar-brand')).toHaveCSS('width', '180px');
  await expect(page.locator('.tab-icon')).toHaveCount(0);
  await expect(page.locator('.brand-copy small')).toHaveCount(0);
  await expect(page.locator('html')).toHaveCSS('font-family', /Pretendard Variable/);
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0);

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
    if (path === '/dispatch') await expect(page.locator('.map-card .maplibregl-canvas')).toBeVisible();
    else await expect(page.locator('.map-card .maplibregl-canvas')).toHaveCount(0);
    await expect(page.locator('main.page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByText(/Demo|Simulation/)).toHaveCount(0);
  }
});

test('compact viewport uses a full-screen navigation menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');

  const navigation = page.getByRole('navigation', { name: '주 메뉴' });
  const menuButton = page.getByRole('button', { name: '사이드바 펼치기' });
  await expect(menuButton).toBeVisible();
  await expect(page.getByRole('link', { name: '관제' })).not.toBeVisible();

  const closedNavigationBox = await navigation.boundingBox();
  expect(closedNavigationBox).toMatchObject({ x: 12, y: 12, width: 196, height: 56 });
  await expect(page.locator('.sidebar-brand-title')).toBeVisible();
  const settingsContentBox = await page.locator('.page-content').boundingBox();
  expect(settingsContentBox.y).toBeGreaterThanOrEqual(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await menuButton.click();
  await expect(page.getByRole('button', { name: '사이드바 접기', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.sidebar-brand-title')).toBeVisible();
  await expect(page.getByRole('link', { name: '관제' })).toBeVisible();
  await expect(page.locator('.main-tab-copy small').first()).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await expect.poll(async () => (await navigation.boundingBox()).x).toBe(0);
  await expect.poll(async () => (await navigation.boundingBox()).width).toBeCloseTo(390, 1);
  const openNavigationBox = await navigation.boundingBox();
  expect(openNavigationBox.x).toBe(0);
  expect(openNavigationBox.y).toBe(0);
  expect(openNavigationBox.width).toBeCloseTo(390, 1);
  expect(openNavigationBox.height).toBe(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('link', { name: '관리' }).click();
  await expectPath(page, '/master-data');
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: '관제' })).not.toBeVisible();

  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: '사이드바 펼치기' }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  await expect(navigation).not.toHaveCSS('position', 'fixed');
});

test('intermediate viewport keeps the navigation vertical and content at the top', async ({ page }) => {
  await page.setViewportSize({ width: 850, height: 900 });
  await page.goto('/dispatch');

  const navigation = page.getByRole('navigation', { name: '주 메뉴' });
  const navigationBox = await navigation.boundingBox();
  const contentBox = await page.locator('.page-content').boundingBox();
  expect(navigationBox).toMatchObject({ x: 12, y: 12, width: 76 });
  expect(contentBox.y).toBeLessThanOrEqual(12);
  expect(contentBox.x).toBeGreaterThanOrEqual(100);
  await expect(navigation).toHaveCSS('grid-auto-flow', 'row');
  await expect(page.locator('main.page')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.page-content')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.operations-hero')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.dispatch-assignment')).toHaveCSS('border-top-width', '1px');
  await expect(page.locator('.dispatch-assignment')).toHaveCSS('border-top-color', 'rgb(229, 229, 234)');

  const tabBoxes = await page.locator('.main-tab').evaluateAll((tabs) => tabs.map((tab) => {
    const box = tab.getBoundingClientRect();
    return { x: box.x, y: box.y };
  }));
  expect(new Set(tabBoxes.map((box) => Math.round(box.x))).size).toBe(1);
  expect(tabBoxes.every((box, index) => index === 0 || box.y > tabBoxes[index - 1].y)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(850);
});

test('dispatch keeps the driver workspace at a fixed desktop width', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/dispatch');
    const workspaceBox = await page.locator('.dispatch-map-workspace').boundingBox();
    const mapBox = await page.locator('.dispatch-map-panel').boundingBox();
    const driverBox = await page.locator('.dispatch-drivers-panel').boundingBox();
    const workspacePaddingRight = await page.locator('.dispatch-map-workspace').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingRight));
    expect(driverBox.width).toBeCloseTo(280, 1);
    expect(driverBox.x + driverBox.width).toBeCloseTo(workspaceBox.x + workspaceBox.width - workspacePaddingRight, 1);
    expect(mapBox.x + mapBox.width).toBeLessThan(driverBox.x);
  }

  const actionButtons = page.locator('.dispatch-assignment-action .btn');
  await expect(actionButtons).toHaveCount(3);
  expect(await actionButtons.evaluateAll((buttons) => buttons.every((button) => (
    getComputedStyle(button).whiteSpace === 'nowrap' && button.scrollWidth <= button.clientWidth
  )))).toBe(true);
});

test('dispatch separates the filter bar without sacrificing workspace height', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/dispatch');
  await expect(page.locator('.dispatch-assignment-toolbar')).toBeVisible();
  await expect(page.locator('.dispatch-map-workspace')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const toolbar = document.querySelector('.dispatch-assignment-toolbar');
    const dateInput = document.querySelector('.dispatch-date-field input');
    const workspace = document.querySelector('.dispatch-map-workspace');
    const toolbarBox = toolbar.getBoundingClientRect();
    const dateInputBox = dateInput.getBoundingClientRect();
    const workspaceBox = workspace.getBoundingClientRect();
    return {
      borderBottomColor: getComputedStyle(toolbar).borderBottomColor,
      controlBottomGap: toolbarBox.bottom - dateInputBox.bottom,
      gap: workspaceBox.top - toolbarBox.bottom,
      paddingBottom: getComputedStyle(toolbar).paddingBottom,
      toolbarHeight: toolbarBox.height,
      workspaceHeight: workspaceBox.height,
    };
  });

  expect(geometry.borderBottomColor).toBe('rgb(236, 239, 243)');
  expect(geometry.controlBottomGap).toBeGreaterThanOrEqual(8);
  expect(geometry.gap).toBe(6);
  expect(geometry.paddingBottom).toBe('8px');
  expect(geometry.toolbarHeight).toBeLessThanOrEqual(44);
  expect(geometry.workspaceHeight).toBeGreaterThanOrEqual(554);
  const mapTitle = page.locator('.dispatch-map-header .admin-section-header > span').first();
  await expect(mapTitle).toBeVisible();
  await expect(mapTitle).toHaveCSS('white-space', 'nowrap');
});

test('admin shell keeps 12 pixel outer geometry and inline page descriptions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/dispatch', '/records', '/master-data', '/settings']) {
    await page.goto(path);
    await expect(page.locator('.page-hero')).toBeVisible();
    const geometry = await page.evaluate(() => {
      const navigation = document.querySelector('.left-tabs');
      const content = document.querySelector('.page-content');
      const hero = document.querySelector('.page-hero');
      const titleGroup = hero?.firstElementChild;
      const description = hero?.querySelector('p');
      const navigationBox = navigation.getBoundingClientRect();
      const contentBox = content.getBoundingClientRect();
      return {
        content: {
          bottom: innerHeight - contentBox.bottom,
          left: contentBox.left,
          right: innerWidth - contentBox.right,
          top: contentBox.top,
        },
        descriptionMarginTop: description ? getComputedStyle(description).marginTop : null,
        descriptionWhiteSpace: description ? getComputedStyle(description).whiteSpace : null,
        navigation: {
          borderColor: getComputedStyle(navigation).borderTopColor,
          left: navigationBox.left,
          top: navigationBox.top,
        },
        padding: getComputedStyle(content).padding,
        titleGroupDisplay: titleGroup ? getComputedStyle(titleGroup).display : null,
      };
    });
    expect(geometry.content).toMatchObject({ bottom: 12, left: 100, right: 12, top: 12 });
    expect(geometry.navigation).toMatchObject({ borderColor: 'rgb(229, 229, 234)', left: 12, top: 12 });
    expect(geometry.padding).toBe('0px 12px');
    expect(geometry.titleGroupDisplay).toBe('flex');
    expect(geometry.descriptionMarginTop).toBe('0px');
    expect(geometry.descriptionWhiteSpace).toBe('nowrap');
  }
});

test('compact control starts with centered collapsed cards and opens empty states full screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/control');
  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());

  await expect(page.locator('#fleetList')).not.toBeVisible();
  await expect(page.locator('#customerList')).not.toBeVisible();
  const mapBox = await page.locator('.map-card').boundingBox();
  expect(mapBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  const bellBox = await page.locator('.notification-bell').boundingBox();
  const mapControlsBox = await page.locator('.maplibregl-ctrl-bottom-right').boundingBox();
  const cardsBox = await page.locator('.control-side').boundingBox();
  expect(390 - bellBox.x - bellBox.width).toBe(12);
  expect(390 - mapControlsBox.x - mapControlsBox.width).toBe(12);
  expect(844 - mapControlsBox.y - mapControlsBox.height).toBe(148);
  expect(390 - cardsBox.x - cardsBox.width).toBe(12);
  for (const cardId of ['vehicleCard', 'customerCard']) {
    const card = await page.locator(`#${cardId}`).boundingBox();
    const heading = await page.locator(`#${cardId} > .section-heading`).boundingBox();
    expect(Math.abs((card.y + card.height / 2) - (heading.y + heading.height / 2))).toBeLessThanOrEqual(.5);
  }

  await page.getByRole('button', { name: '차량 리스트 펼치기' }).click();
  await expect(page.locator('#fleetList')).toBeVisible();
  await expect(page.getByText('차량이 없습니다.')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const panelBox = await page.locator('.panel-view').boundingBox();
  expect(panelBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await page.getByRole('button', { name: '차량 리스트 닫기' }).click();
  await expect(page.getByRole('button', { name: '차량 리스트 펼치기' })).toBeVisible();

  await page.getByRole('button', { name: '고객사별 주문 펼치기' }).click();
  await expect(page.locator('#customerList')).toBeVisible();
  await expect(page.getByText('등록된 고객사 주문이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '고객사별 주문 닫기' }).click();
  await expect(page.getByRole('button', { name: '고객사별 주문 펼치기' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('notification center opens, closes, and remains empty after reload', async ({ page }) => {
  await page.goto('/control');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();

  await expect(page.locator('.notification-count')).toBeHidden();
  await page.getByLabel('알림 열기').click();
  await expect(page.getByText('알림 센터')).toBeVisible();
  await expect(page.getByText('운영 알림을 확인하세요.')).toBeVisible();
  await expect(page.getByText('알림이 없습니다.')).toBeVisible();
  await expect(page.getByText('읽지 않은 알림 0건')).toBeVisible();
  await page.getByLabel('알림 닫기').click();
  await page.reload();
  await expect(page.locator('.notification-count')).toBeHidden();

  await expect(page.getByText(/Demo|Simulation/)).toHaveCount(0);
});

test('management customer workspace omits unsupported delivery links', async ({ page }) => {
  await page.goto('/master-data');
  await expect(page.getByRole('button', { name: '운송자원', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.getByText('고객사를 등록하세요.').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /배송조회/ })).toHaveCount(0);
});

test('dispatch upload exposes validation and can be cancelled', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 620 });
  await page.goto('/dispatch');
  await expect(page.getByText('표시할 배송지가 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '실시간 트레킹' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '새로고침' })).toHaveCount(0);
  const assignmentBeforeUpload = await page.locator('.dispatch-assignment').boundingBox();
  await page.getByRole('button', { name: '주문 업로드' }).click();
  const assignmentAfterUpload = await page.locator('.dispatch-assignment').boundingBox();
  expect(assignmentAfterUpload).toEqual(assignmentBeforeUpload);
  await expect(page.getByText('CSV 또는 XLSX 배차 파일을 선택하거나 이 영역에 끌어 놓으세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '파일 업로드', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '예제 업로드', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '예제 업로드', exact: true }).click();
  await expect(page.getByText('dsv-fixed-dispatch-10.csv', { exact: true })).toBeVisible();
  await expect(page.locator('.dispatch-upload-summary')).toContainText('10');
  await expect(page.getByRole('button', { name: '파일 업로드', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예제 업로드', exact: true })).toHaveCount(0);
  await expect(page.getByText('*셀을 더블클릭하여 수정', { exact: true })).toBeVisible();
  const sheetFrame = page.locator('.dispatch-upload-sheet');
  const sheetScroll = page.locator('.dispatch-upload-sheet .sheet-scroll');
  const uploadPanel = page.locator('.condition-upload-panel');
  const [sheetFrameBox, sheetScrollBox, uploadPanelBox] = await Promise.all([sheetFrame.boundingBox(), sheetScroll.boundingBox(), uploadPanel.boundingBox()]);
  expect(sheetFrameBox.height).toBe(280);
  expect(sheetScrollBox.height).toBe(280);
  expect(sheetScrollBox.x).toBe(sheetFrameBox.x);
  expect(sheetFrameBox.x - uploadPanelBox.x).toBe(13);
  expect(uploadPanelBox.x + uploadPanelBox.width - sheetFrameBox.x - sheetFrameBox.width).toBe(13);
  await expect(sheetFrame).toHaveCSS('overflow', 'hidden');
  await expect(sheetFrame).toHaveCSS('border-radius', '0px');
  await expect(sheetFrame).toHaveCSS('border-top-width', '0px');
  await expect(sheetScroll).toHaveCSS('border-radius', '0px');
  await expect(sheetScroll).toHaveCSS('border-top-width', '0px');
  const firstBoxCell = page.locator('.dispatch-upload-sheet tbody tr:nth-child(2) td:nth-of-type(5) .sheet-cell');
  await firstBoxCell.dblclick();
  const firstBoxEditor = page.getByLabel('2행 E열 편집', { exact: true });
  await expect(firstBoxEditor).toBeVisible();
  await firstBoxEditor.fill('0');
  await firstBoxEditor.press('Enter');
  await expect(firstBoxCell).toHaveText('0');
  await expect(firstBoxCell.locator('..')).toHaveClass(/is-warning/u);
  await expect(firstBoxCell.locator('..')).toHaveCSS('box-shadow', /rgb\(217, 154, 0\)/u);
  await expect(page.locator('.dispatch-upload-summary')).toContainText('주의 1');
  const cancelButton = uploadPanel.getByRole('button', { name: '취소', exact: true });
  const closeButton = uploadPanel.getByRole('button', { name: '닫기', exact: true });
  await expect(cancelButton).toBeVisible();
  const [cancelBox, closeBox] = await Promise.all([cancelButton.boundingBox(), closeButton.boundingBox()]);
  expect(cancelBox.y).toBe(closeBox.y);
  expect(cancelBox.height).toBe(closeBox.height);
  const issueDetails = page.locator('details.dispatch-upload-issues');
  await expect(issueDetails).not.toHaveAttribute('open', '');
  await expect(issueDetails.locator('.dispatch-upload-toggle-open')).toBeVisible();
  await expect(issueDetails.locator('.dispatch-upload-toggle-close')).toBeHidden();
  await issueDetails.locator('summary').click();
  await expect(issueDetails.locator('.dispatch-upload-toggle-open')).toBeHidden();
  await expect(issueDetails.locator('.dispatch-upload-toggle-close')).toBeVisible();
  const firstBoxIssue = issueDetails.locator('.dispatch-upload-issue-row').filter({ hasText: '2행' }).filter({ hasText: 'E열' });
  await expect(firstBoxIssue).toHaveClass(/is-review/u);
  await expect(firstBoxIssue).toContainText('0박스로 업로드할 수 있습니다.');
  await expect(issueDetails.locator('.dispatch-upload-issue-row').filter({ hasText: 'A열' }).first()).toContainText('등록된 배송원을 찾을 수 없습니다.');
  await expect(issueDetails.locator('.dispatch-upload-issue-row').filter({ hasText: 'B열' }).first()).toContainText('등록된 차량 번호를 찾을 수 없습니다.');
  await expect(issueDetails).toContainText('등록된 배송원을 찾을 수 없습니다.');
  await expect(issueDetails).toContainText('등록된 차량 번호를 찾을 수 없습니다.');
  await expect(issueDetails).not.toContainText('대상을 찾을 수 없습니다.');
  const uploadScroll = page.locator('.dispatch-upload-scroll');
  const scrollMetrics = await uploadScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  await page.locator('.condition-candidate').last().scrollIntoViewIfNeeded();
  expect(await uploadScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.condition-candidate').last()).toBeVisible();
  await closeButton.click();
  await page.getByRole('button', { name: '주문 업로드' }).click();
  await expect(page.getByText('dsv-fixed-dispatch-10.csv', { exact: true })).toBeVisible();
  await cancelButton.click();
  await expect(page.getByText('dsv-fixed-dispatch-10.csv', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '파일 업로드', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '예제 업로드', exact: true })).toBeVisible();
  await expect(page.locator('.dispatch-upload-summary')).toHaveCount(0);
  await uploadPanel.getByRole('button', { name: '닫기', exact: true }).click();
});

test('empty notification center does not fabricate vehicle actions', async ({ page }) => {
  await page.goto('/control');
  await page.getByLabel('알림 열기').click();
  await expect(page.getByText('알림이 없습니다.')).toBeVisible();
  await expect(page.getByRole('button', { name: '차량 조회' })).toHaveCount(0);
  await expect(page.locator('[data-notification-id]')).toHaveCount(0);
  await expect(page.locator('[data-vehicle-id]')).toHaveCount(0);
});
