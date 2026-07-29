import { test, expect } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';

test('web-hosted Korea profile and style declare one consistent provider boundary', () => {
  const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const profile = JSON.parse(readFileSync(new URL('../../public/map/profile.json', import.meta.url), 'utf8'));
  const style = JSON.parse(readFileSync(new URL('../../public/map/styles/dsv-korea-v1.json', import.meta.url), 'utf8'));
  const externalUrls = [
    style.glyphs,
    style.sprite,
    ...Object.values(style.sources).flatMap((source) => [source.url, ...(source.tiles ?? [])]),
  ].filter(Boolean);
  const externalHosts = [...new Set(externalUrls.map((url) => new URL(url).host))];

  expect(profile).toMatchObject({
    profileId: 'dsv-korea-v1',
    providerMode: 'public_allowlisted',
    regionCode: 'KR',
    styleUrl: '/map/styles/dsv-korea-v1.json',
  });
  expect(style.metadata).toMatchObject({
    dsvProfileId: profile.profileId,
    dsvProviderMode: profile.providerMode,
    dsvPublicHosts: externalHosts,
  });
  const previewSize = statSync(new URL('../../public/map/dsv-korea-placeholder.webp', import.meta.url)).size;
  expect(previewSize).toBeGreaterThan(50_000);
  expect(previewSize).toBeLessThan(600_000);
  expect(index).toContain('<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin />');
});

test('control map renders the configured departure marker without synthetic route layers', async ({ page }) => {
  const osrmRequests = [];
  const requestedUrls = [];
  page.on('request', (request) => {
    requestedUrls.push(request.url());
    if (request.url().includes('/route/v1/driving/')) osrmRequests.push(request.url());
  });

  await page.goto('/control');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());

  const mapState = await page.evaluate(() => {
    const map = window.dsvMap;
    const style = map.getStyle();
    return {
      center: map.getCenter().toArray(),
      syntheticLayers: style.layers.filter((layer) => layer.id.startsWith('demo-')).map((layer) => layer.id),
      syntheticSources: Object.keys(style.sources).filter((sourceId) => sourceId.startsWith('demo-')),
    };
  });

  expect(mapState.syntheticLayers).toEqual([]);
  expect(mapState.syntheticSources).toEqual([]);
  expect(osrmRequests).toEqual([]);
  expect(requestedUrls.some((url) => url.endsWith('/map/profile.json'))).toBe(true);
  expect(requestedUrls.some((url) => url.endsWith('/map/styles/dsv-korea-v1.json'))).toBe(true);
  expect(requestedUrls.some((url) => url.includes('tiles.openfreemap.org/styles/liberty'))).toBe(false);
  await expect(page.getByRole('img', { name: /출발 위치: 경기도 군포시 번영로 82/ })).toBeVisible();
  const attributionText = await page.locator('.maplibregl-ctrl-attrib-inner').innerText();
  expect(attributionText.match(/OpenFreeMap/gu)).toHaveLength(1);
  await expect(page.getByText('예정 차량이 없습니다.')).toBeVisible();
  await expect(page.getByText('등록된 제조사 주문이 없습니다.')).toBeVisible();
});

test('control map stays flat and the notification occupies the former display-control slot', async ({ page }) => {
  await page.goto('/control');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('알림 열기')).toBeVisible();
  await expect(page.locator('.maplibregl-ctrl-compass')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getPitch())).toBe(0);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getBearing())).toBe(0);
  expect(await page.evaluate(() => ({
    dragRotateEnabled: window.dsvMap.dragRotate.isEnabled(),
    touchPitchEnabled: window.dsvMap.touchPitch.isEnabled(),
  }))).toEqual({ dragRotateEnabled: false, touchPitchEnabled: false });
});

test('customer delivery page does not fabricate vehicle or route features', async ({ page }) => {
  await page.goto('/customer/delivery-inquiry?customer=customer-dsv');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());

  const operationalSourceIds = await page.evaluate(() => (
    Object.keys(window.dsvMap.getStyle().sources).filter((sourceId) => sourceId.startsWith('demo-'))
  ));
  expect(operationalSourceIds).toEqual([]);

  await expect(page.getByText('주문 없음', { exact: true })).toBeVisible();
  await expect(page.getByText(/CR-\d+/)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.dsvMap.getStyle().sources).filter((sourceId) => sourceId.startsWith('demo-')))).toEqual([]);
});

test('cached low-resolution map stays visible until the live style is ready', async ({ page }) => {
  await page.route('**/map/styles/dsv-korea-v1.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue();
  });

  await page.goto('/control');

  const placeholder = page.locator('.map-placeholder');
  const loadingStatus = page.getByRole('status').filter({ hasText: '지도 불러오는 중' });
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toHaveCSS('opacity', '1');
  await expect(loadingStatus).toBeVisible();
  await expect(page.locator('.control-side')).toHaveCount(0);

  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());
  await expect(loadingStatus).toHaveCount(0);
  await expect(placeholder).toHaveCSS('opacity', '0');
  await expect(page.locator('.map-canvas')).toHaveCSS('opacity', '1');
  await expect(page.locator('.control-side')).toBeVisible();
});

test('map initialization fails visibly and retries only after an explicit user action', async ({ page }) => {
  let styleRequests = 0;
  await page.route('**/map/styles/dsv-korea-v1.json', async (route) => {
    styleRequests += 1;
    if (styleRequests === 1) {
      await route.fulfill({ contentType: 'application/json', status: 503, body: '{}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/control');

  const alert = page.getByRole('alert').filter({ hasText: '지도 데이터를 불러오지 못했습니다.' });
  await expect(alert).toBeVisible();
  await page.waitForTimeout(750);
  expect(styleRequests).toBe(1);

  await alert.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await page.waitForFunction(() => window.dsvMap?.isStyleLoaded());
  expect(styleRequests).toBe(2);
  await expect(alert).toHaveCount(0);
});
