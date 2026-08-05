import { test, expect } from '@playwright/test';

test('all admin tabs and native controls use bundled Pretendard', async ({ page }) => {
  for (const path of ['/control', '/dispatch', '/records', '/master-data', '/settings']) {
    await page.goto(path);
    if (path === '/control') await page.locator('.maplibregl-map').waitFor();
    const fonts = await page.locator('body, button, input, select, textarea, table, .maplibregl-map').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((font) => font.includes('Pretendard'))).toBe(true);
  }
});

test('master data keeps both resource workspaces visible while operational data starts empty', async ({ page }) => {
  await page.goto('/master-data');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();

  await expect(page.locator('h1', { hasText: 'CLEVER DSV' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '관리', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '운송자원', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트')).toBeVisible();
  await expect(page.getByLabel('배송원 상세')).toBeVisible();
  await expect(page.getByText('등록된 배송원이 없습니다.')).toBeVisible();
  await expect(page.getByLabel('차량 리스트')).toBeVisible();
  await expect(page.getByLabel('차량 상세')).toBeVisible();
  await expect(page.getByText('등록된 차량이 없습니다.')).toBeVisible();
  await expect(page.locator('.management-subnav')).toHaveCount(0);
  await page.getByRole('button', { name: '고객사', exact: true }).click();
  await expect(page.getByText('고객사를 선택하면 상세 정보를 확인할 수 있습니다.')).toBeVisible();
  const networkWorkspaces = page.locator('.management-network-shell > .resource-workspace');
  await expect(networkWorkspaces).toHaveCount(2);
  for (const workspace of await networkWorkspaces.all()) {
    const [listBox, detailBox] = await Promise.all([
      workspace.locator('.management-list-panel').boundingBox(),
      workspace.locator('.management-detail-panel').boundingBox(),
    ]);
    expect(Math.abs(listBox.width - detailBox.width)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('.master-customer-table tbody tr')).toHaveCount(0);
  await expect(page.locator('.master-destination-table tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: '운송조건' }).click();
  await expect(page.getByRole('cell', { name: 'COLD', exact: true })).toBeVisible();
  await expect(page.getByText('조건 상세')).toBeVisible();
  await expect(page.getByText('CLEVER 고객사')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/MapCanvas-')).length)).toBe(0);
});

test('resource workspaces prioritize the list at intermediate width without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/master-data');

  const workspaces = page.locator('.resource-workspace');
  await expect(workspaces).toHaveCount(2);
  for (const workspace of await workspaces.all()) {
    const [listBox, detailBox] = await Promise.all([
      workspace.locator('.management-list-panel').boundingBox(),
      workspace.locator('.management-detail-panel').boundingBox(),
    ]);
    expect(listBox.width).toBeGreaterThan(detailBox.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024);
});

test('dispatch switches between map and table views without replacing the driver workspace', async ({ page }) => {
  await page.goto('/dispatch');
  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' })).toBeVisible();

  await page.getByRole('button', { name: '목록', exact: true }).click();
  await expect(page.getByRole('region', { name: '목록' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '주문' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '배송처' })).toBeVisible();
  await expect(page.getByText('배차 없음', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' })).toBeVisible();

  await page.getByRole('button', { name: '지도', exact: true }).click();
  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
});

test('operational mock fixtures stay absent until fixed dispatch data is rebuilt', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByText('차량이 없습니다.')).toBeVisible();
  await expect(page.getByText('등록된 고객사 주문이 없습니다.')).toBeVisible();
  await expect(page.locator('[data-vehicle-id]')).toHaveCount(0);

  await page.goto('/dispatch');
  await expect(page.getByRole('heading', { name: '배차' })).toBeVisible();
  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' })).toBeVisible();
  await expect(page.getByText('표시할 배송지가 없습니다.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '배송원' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '차량' })).toBeVisible();
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  await expect(page.getByText('군포복합물류센터 준비')).toHaveCount(0);
  await expect(page.getByText('군포복합물류센터 출발')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '주문' })).toHaveCount(0);

  await page.goto('/records');
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole('heading', { name: '이력', exact: true })).toBeVisible();
  await expect(page.getByText('배송 이력', { exact: true })).toBeVisible();
  await expect(page.getByText('배송 이력이 없습니다.')).toBeVisible();
  await expect(page.getByText('0건', { exact: true })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await expect(page.getByText('알림 기준', { exact: true })).toBeVisible();
  await expect(page.getByText('특장 온도 상한')).toHaveCount(0);
  await expect(page.getByText('온도 경고')).toHaveCount(0);
  await expect(page.getByText('배송조회', { exact: true })).toHaveCount(0);
});

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/settings');
  const loadingStartTime = page.getByLabel('준비 시작 시간');
  const plannedDepartureTime = page.getByLabel('출발 예정 시간');
  const delayAlerts = page.getByRole('checkbox', { name: '배송원에게 전달' });

  await loadingStartTime.fill('07:45');
  await plannedDepartureTime.fill('08:20');
  await delayAlerts.uncheck();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다.' })).toBeVisible();
  await page.reload();

  await expect(loadingStartTime).toHaveValue('07:45');
  await expect(plannedDepartureTime).toHaveValue('08:20');
  await expect(delayAlerts).not.toBeChecked();
});

test('dispatch uses the shared planned departure setting', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('준비 시작 시간').fill('07:40');
  await page.getByLabel('출발 예정 시간').fill('08:10');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.goto('/dispatch');

  await expect(page.getByLabel('출발 시간')).toHaveValue('08:10');
  await page.getByLabel('출발 시간').fill('08:25');
  await page.getByRole('button', { name: '저장', exact: true }).first().click();
  await page.goto('/settings');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:25');
});

test('runtime scroll owners remain scrollable without visible scrollbars', async ({ page }) => {
  const ownership = [
    ['/control', '.notification-stack, #fleetList, #destinationList'],
    ['/master-data', '.courier-list'],
    ['/customer/delivery-inquiry', '.customer-order-card'],
  ];

  for (const [path, selector] of ownership) {
    await page.goto(path);
    const owners = page.locator(selector);
    await expect(owners).not.toHaveCount(0);
    expect(await owners.evaluateAll((elements) => elements.every((element) => element.classList.contains('overlay-scroll')))).toBe(true);
    expect(await owners.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).scrollbarGutter === 'auto'))).toBe(true);
    expect(await owners.evaluateAll((elements) => elements.every((element) => {
      const scrollbar = getComputedStyle(element, '::-webkit-scrollbar');
      return getComputedStyle(element).scrollbarWidth === 'none' && scrollbar.display === 'none';
    }))).toBe(true);
  }

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ['/control', '/dispatch', '/records', '/master-data', '/settings', '/customer/delivery-inquiry']) {
      await page.goto(path);
      if (viewport.width === 390) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
      if (path === '/control') await page.getByLabel('알림 열기').click();
      const auditIds = await page.evaluate(() => [...document.querySelectorAll('.overlay-scroll')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && style.display !== 'none'
            && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
        })
        .map((element, index) => {
          element.setAttribute('data-scroll-geometry-audit', String(index));
          return index;
        }));

      for (const id of auditIds) {
        const owner = page.locator(`[data-scroll-geometry-audit="${id}"]`);
        const before = await owner.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }));
        expect(await owner.evaluate((element) => {
          const { scrollTop, scrollLeft } = element;
          if (element.scrollHeight > element.clientHeight) element.scrollTop = scrollTop + 1;
          else element.scrollLeft = scrollLeft + 1;
          const moved = element.scrollTop !== scrollTop || element.scrollLeft !== scrollLeft;
          element.scrollTop = scrollTop;
          element.scrollLeft = scrollLeft;
          return moved;
        })).toBe(true);
        await owner.hover({ force: true });
        await expect.poll(() => owner.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))).toEqual(before);
      }

      const unowned = await page.evaluate(() => [...document.querySelectorAll('*')].filter((element) => {
        if (element === document.body || element === document.documentElement || element.classList.contains('overlay-scroll')) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && /(auto|scroll)/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`)
          && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
      }).map((element) => `${element.tagName.toLowerCase()}.${element.className}`));
      expect(unowned).toEqual([]);
    }
  }
});

test('admin section headings use one visual system', async ({ page }) => {
  for (const path of ['/dispatch', '/records', '/master-data', '/settings']) {
    await page.goto(path);
    const headings = page.locator('.section-heading');
    await expect.poll(() => headings.count()).toBeGreaterThan(0);
    const styles = await headings.evaluateAll((elements) => elements.map((element) => ({
      height: Math.round(element.getBoundingClientRect().height),
      radius: getComputedStyle(element).borderRadius,
      background: getComputedStyle(element).backgroundImage,
      shadow: getComputedStyle(element).boxShadow,
    })));
    expect(styles.every((style) => style.height >= 44 && style.height <= 45 && style.radius === '0px' && style.background === 'none' && style.shadow === 'none')).toBe(true);
  }
});

test('mock dispatch keeps the upload entry and empty map workspace', async ({ page }) => {
  await page.goto('/dispatch');
  await expect(page.getByRole('button', { name: '주문 업로드', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '지도' })).toBeVisible();
  await expect(page.getByRole('region', { name: '배송원' })).toBeVisible();
  await expect(page.getByText('표시할 배송지가 없습니다.')).toBeVisible();
  await expect(page.getByRole('region', { name: '주문' })).toHaveCount(0);
  await expect(page.locator('table.remote-dispatch-table')).toHaveCount(0);
  await expect(page.getByText('김도윤')).toHaveCount(0);
  await expect(page.getByText('21사 6101')).toHaveCount(0);
});

test('compact dispatch stacks the map and driver workspace without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 449, height: 835 });
  await page.goto('/dispatch');
  await expect(page.locator('.dispatch-map-workspace')).toBeVisible();
  await expect(page.locator('.dispatch-workspace-panel')).toHaveCount(2);

  const layout = await page.evaluate(() => {
    const workspace = document.querySelector('.dispatch-map-workspace');
    const panels = [...document.querySelectorAll('.dispatch-workspace-panel')];
    const workspaceBox = workspace.getBoundingClientRect();
    const headerBox = document.querySelector('.left-tabs').getBoundingClientRect();
    const contentBox = document.querySelector('.page-content').getBoundingClientRect();
    return {
      bodyWidth: document.body.scrollWidth,
      contentY: contentBox.y,
      headerWidth: headerBox.width,
      workspaceWidth: workspaceBox.width,
      panels: panels.map((panel) => {
        const box = panel.getBoundingClientRect();
        return { height: box.height, width: box.width };
      }),
    };
  });

  expect(layout.bodyWidth).toBe(449);
  expect(layout.headerWidth).toBe(196);
  expect(layout.contentY).toBeGreaterThanOrEqual(80);
  expect(layout.panels).toHaveLength(2);
  expect(layout.panels.every((panel) => Math.abs(panel.width - layout.workspaceWidth) <= 1)).toBe(true);
  expect(layout.panels[0].height).toBeGreaterThanOrEqual(560);
  expect(layout.panels[1].height).toBeGreaterThanOrEqual(420);
});
