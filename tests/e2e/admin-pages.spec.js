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

test('master data page keeps resource data in one local workspace', async ({ page }) => {
  await page.goto('/master-data');
  await page.getByRole('button', { name: '사이드바 펼치기' }).click();

  await expect(page.locator('h1', { hasText: 'CLEVER DSV' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '관리', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('13명')).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('김도윤')).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('이서연')).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByRole('columnheader', { name: '차량' })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByRole('columnheader', { name: '연령', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByRole('columnheader', { name: '성별', exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('42세', { exact: true })).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('남성', { exact: true }).first()).toBeVisible();
  const courierPanelTopGaps = await page.locator('.courier-grid > .page-panel').evaluateAll((panels) => panels.map((panel) => panel.querySelector('.section-heading').getBoundingClientRect().top - panel.getBoundingClientRect().top));
  expect(courierPanelTopGaps.every((gap) => gap <= 11)).toBe(true);
  await expect(page.getByLabel('배송원 리스트').getByText('21사 6101')).toBeVisible();
  await expect(page.getByLabel('배송원 리스트').getByText('1대')).toHaveCount(0);
  await expect(page.locator('.courier-list-table td strong').first()).toHaveCSS('font-size', '14px');
  await expect(page.locator('.courier-list-table td').first()).toHaveCSS('font-size', '13px');
  await expect(page.locator('.courier-list-table th').first()).toHaveCSS('font-size', '13px');
  await page.locator('[data-courier-id="c02"]').click();
  await expect(page.locator('[data-courier-id="c02"]')).toHaveClass(/\bactive\b/);
  await expect(page.locator('[data-courier-id="c01"]')).not.toHaveClass(/\bactive\b/);
  await page.locator('[data-courier-id="c01"]').click();
  await expect(page.getByLabel('배송원 상세').getByText('등급 A+')).toBeVisible();
  await expect(page.getByLabel('배송원 상세').getByRole('button', { name: /21사 6101/ })).toBeVisible();
  await expect(page.getByLabel('배송원 상세').getByText('배송 기록', { exact: true })).toBeVisible();
  await page.locator('[data-courier-id="c13"]').click();
  await expect(page.getByLabel('배송원 상세').getByRole('cell', { name: '잠실역', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '고객사' }).click();
  await expect(page.getByText('고객사 상세')).toBeVisible();
  const [customerBox, destinationBox] = await Promise.all([
    page.locator('.master-network-grid > .page-panel').nth(0).boundingBox(),
    page.locator('.master-network-grid > .page-panel').nth(1).boundingBox(),
  ]);
  expect(Math.abs(customerBox.width - destinationBox.width)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('link', { name: 'CLEVER - 고객사 Demo 배송조회' })).toHaveAttribute('href', '/customer/delivery-inquiry?customer=customer-dsv');
  await expect(page.locator('.master-customer-table tbody tr').first().getByText('3건', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '운송조건' }).click();
  await expect(page.getByRole('cell', { name: 'COLD', exact: true })).toBeVisible();
  await expect(page.getByText('조건 상세')).toBeVisible();
  await expect(page.getByText('김민수')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/MapCanvas-')).length)).toBe(0);
});
test('admin tabs render canonical demo data from reference html', async ({ page }) => {
  await page.goto('/control');
  await expect(page.getByText('8대')).toBeVisible();
  await expect(page.locator('[data-vehicle-id^="load"]')).toHaveCount(0);
  await expect(page.locator('#fleetList [data-vehicle-id]').first()).toHaveAttribute('data-vehicle-id', 'final12');
  await expect(page.locator('#fleetList [data-vehicle-id]').last()).toHaveAttribute('data-vehicle-id', 'complete12');
  const departedVehicle = page.locator('[data-vehicle-id="depart01"]');
  await expect(departedVehicle.locator('.status-pill')).toHaveText(['이동중', '1번']);
  await expect(departedVehicle.locator('.row-meta')).toHaveCount(0);
  await expect(departedVehicle).not.toContainText('상차');
  await expect(page.getByText('12개', { exact: true })).toBeVisible();
  await expect(page.locator('.plate-text', { hasText: '21사 6101' })).toBeVisible();
  await expect(page.locator('#destinationList').getByText('강남역')).toBeVisible();

  await page.goto('/dispatch');
  await expect(page.getByRole('heading', { name: '배차' })).toBeVisible();
  await expect(page.getByText('배차 현황', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '배송원' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '차량' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '상태' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: '진행' })).toHaveCount(0);
  await expect(page.getByText('군포복합물류센터 준비')).toBeVisible();
  await expect(page.getByText('군포복합물류센터 출발')).toBeVisible();
  await expect(page.getByText('배송 상세', { exact: true })).toBeVisible();
  await expect(page.getByText('POD', { exact: true })).toBeVisible();

  await page.goto('/records');
  await expect(page.getByRole('heading', { name: '이력' })).toBeVisible();
  await expect(page.getByText('완료 배송 기록')).toBeVisible();
  await expect(page.getByText('100건 저장됨')).toBeVisible();
  await expect.poll(() => page.getByRole('cell', { name: '정문 하차 불가' }).count()).toBeGreaterThan(0);
  await page.locator('.record-row').nth(1).click();
  await expect(page.getByText('#002')).toBeVisible();
  await expect(page.locator('.page-panel').filter({ hasText: '메모 기록' }).getByText('DMC 누리꿈스퀘어')).toBeVisible();
  await expect(page.locator('.page-panel').filter({ hasText: '메모 기록' }).getByText('지하주차장 높이 제한')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible();
  await expect(page.getByText('알림 기준', { exact: true })).toBeVisible();
  await expect(page.getByText('특장 온도 상한')).toBeVisible();
  await expect(page.getByText('배송조회', { exact: true })).toHaveCount(0);
});

test('admin settings persist after reload', async ({ page }) => {
  await page.goto('/settings');
  const loadingStartTime = page.getByLabel('준비 시작 시간');
  const plannedDepartureTime = page.getByLabel('출발 예정 시간');
  const temperatureLimit = page.locator('tr').filter({ hasText: '특장 온도 상한' }).locator('input');
  const delayAlerts = page.getByRole('checkbox', { name: '배송원에게 전달' });

  await loadingStartTime.fill('07:45');
  await plannedDepartureTime.fill('08:20');
  await temperatureLimit.fill('9.5');
  await delayAlerts.uncheck();
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다.' })).toBeVisible();
  await page.reload();

  await expect(loadingStartTime).toHaveValue('07:45');
  await expect(plannedDepartureTime).toHaveValue('08:20');
  await expect(temperatureLimit).toHaveValue('9.5');
  await expect(delayAlerts).not.toBeChecked();
});

test('dispatch uses the shared planned departure setting', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('준비 시작 시간').fill('07:40');
  await page.getByLabel('출발 예정 시간').fill('08:10');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.goto('/dispatch');

  await expect(page.getByLabel('출발 시간')).toHaveValue('08:10');
  await expect(page.getByLabel('배송 전체 타임라인').getByText('07:40', { exact: true })).toBeVisible();
  await page.getByLabel('출발 시간').fill('08:25');
  await page.getByRole('button', { name: '저장', exact: true }).first().click();
  await page.goto('/settings');
  await expect(page.getByLabel('출발 예정 시간')).toHaveValue('08:25');
});

test('runtime scroll owners remain scrollable without visible scrollbars', async ({ page }) => {
  const ownership = [
    ['/control', '.notification-stack, .left-expansion, .event-log, #fleetList, #destinationList'],
    ['/master-data', '.courier-list, .courier-history-scroll'],
    ['/dispatch', '.work-scroll, .work-timeline-list, .work-cargo-table, .proof-image-grid'],
    ['/records', '.record-scroll, .timeline'],
    ['/customer/delivery-inquiry', '.customer-order-card'],
  ];

  for (const [path, selector] of ownership) {
    await page.goto(path);
    const owners = page.locator(selector);
    expect(await owners.count()).toBeGreaterThan(0);
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
  for (const path of ['/control', '/dispatch', '/records', '/master-data', '/settings']) {
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

test('operations uses a half table and stacked timeline with 24-hour arrivals', async ({ page }) => {
  await page.goto('/dispatch');
  await expect(page.locator('.work-courier-table th').first()).toHaveCSS('font-weight', '700');
  await expect(page.locator('.work-courier-table th')).toHaveCount(2);
  await expect(page.locator('.work-courier-table td strong').first()).toHaveCSS('font-weight', '700');
  await expect(page.locator('.work-courier-table td small').first()).toHaveCSS('font-weight', '500');
  await expect(page.locator('.work-courier-table tbody tr').first().locator('td').nth(1).locator('small')).toHaveCount(0);
  await expect(page.locator('.work-status-text, .work-progress')).toHaveCount(0);
  const leftTable = page.getByLabel('배송원 선택');
  const rightStack = page.locator('.work-right-stack');
  const [leftBox, rightBox] = await Promise.all([leftTable.boundingBox(), rightStack.boundingBox()]);
  expect(Math.abs(leftBox.width - rightBox.width)).toBeLessThanOrEqual(1);

  const rightPanels = rightStack.locator(':scope > .work-column');
  const [timelineBox, proofBox] = await Promise.all([rightPanels.nth(0).boundingBox(), rightPanels.nth(1).boundingBox()]);
  expect(Math.abs(timelineBox.height - proofBox.height)).toBeLessThanOrEqual(1);

  const timelineEdge = await page.getByLabel('배송 전체 타임라인').evaluate((list) => {
    const row = list.querySelector('.work-timeline-row');
    return list.getBoundingClientRect().right - row.getBoundingClientRect().right;
  });
  expect(timelineEdge).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('배송 전체 타임라인').locator('small')).toHaveCount(0);

  await page.getByLabel('출발 시간').fill('23:50');
  await expect(page.getByLabel('배송 전체 타임라인').getByText('09:05', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '저장', exact: true }).first().click();
  await expect(page.getByLabel('배송 전체 타임라인').getByText('00:25', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /역삼역/ }).click();
  await expect(page.getByLabel('선택 배송 상세').getByText(/00:31 도착 예정/)).toBeVisible();
});
