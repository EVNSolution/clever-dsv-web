import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const routeOrigin = [126.9372235, 37.330948];

test('DAFD54 is reserved for the spotlight vehicle marker asset', () => {
  const spotlight = readFileSync(new URL('../../src/assets/vehicle-marker-spotlight.svg', import.meta.url), 'utf8');
  const defaultMarker = readFileSync(new URL('../../src/assets/vehicle-marker-default.svg', import.meta.url), 'utf8');
  const mapCanvas = readFileSync(new URL('../../src/components/MapCanvas.tsx', import.meta.url), 'utf8');
  expect(spotlight).toContain('#DAFD54');
  expect(`${defaultMarker}${mapCanvas}`).not.toContain('#DAFD54');
});

test('OSRM route cache renders immediately and revalidates after reload', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/osrm-engine/route/v1/driving/**', async (route) => {
    requests += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ routes: [{ geometry: { coordinates: [routeOrigin, [127.027619, 37.497952], [127.036545, 37.500643], [127.04898, 37.504503]] }, legs: Array.from({ length: 12 }, (_, index) => ({ duration: (index + 1) * 60 })) }] }),
    });
  });

  await page.goto('/control');
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('clever.osrm.route.v3.')).length), { timeout: 15_000 }).toBe(5);
  await expect(page.locator('[data-vehicle-id="depart01"] .chip')).toHaveText('1분 예상');
  await expect(page.locator('#destinationList .stop-times').first().locator('time')).toHaveText(['08:31', '-']);
  await expect(page.locator('#destinationList .stop-times').first().locator('time').last()).toHaveClass('empty');
  await expect(page.locator('.stop-time-head')).toHaveCSS('text-align', 'center');
  await expect(page.locator('.stop-time-head')).toContainText('배송지');
  await expect(page.locator('#destinationList .t').first()).toHaveCSS('border-bottom-style', 'solid');
  await expect(page.locator('#destinationList .stop-times').first()).toHaveCSS('text-align', 'center');
  await page.locator('[data-vehicle-id="to10"]').click();
  await expect(page.locator('#destinationList .stop-times').first().locator('time')).toHaveText(['07:41', '08:18']);
  await expect(page.locator('#destinationList .stop-times').nth(1).locator('time')).toHaveText(['08:25+37', '08:27']);
  await expect(page.locator('#destinationList .stop-times').nth(1).locator('small')).toHaveCSS('font-size', '10px');
  await expect(page.locator('.stop-time-head span').nth(1)).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -10, 0)');
  await expect(page.locator('#destinationList .stop-times').nth(9).locator('time').first()).toHaveText('09:46+26');
  await page.reload();
  await expect.poll(() => requests, { timeout: 15_000 }).toBe(10);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('control map defaults to fleet overview and spotlights only after vehicle selection', async ({ page }) => {
  await page.goto('/control');
  await page.waitForFunction(() => window.dsvMap?.getSource('demo-vehicles'));

  const mapSnapshot = () => page.evaluate(() => {
    const map = window.dsvMap;
    const data = (id) => map.getSource(id).serialize().data;
    const pixels = (id) => {
      const image = map.getImage(id).data;
      const bytes = image.data || image;
      let opaque = 0;
      let lime = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        if (bytes[index + 3] > 0) opaque += 1;
        if (bytes[index] === 218 && bytes[index + 1] === 253 && bytes[index + 2] === 84 && bytes[index + 3] > 0) lime += 1;
      }
      return { opaque, lime };
    };
    return {
      vehicles: data('demo-vehicles').features,
      stops: data('demo-stops').features,
      origin: data('demo-origin').features[0],
      routes: data('demo-routes').features,
      selectedRoute: data('demo-route-selected').features[0],
      nextRoute: data('demo-route-next').features[0],
      routeCount: data('demo-routes').features.length,
      selectedRouteCount: data('demo-route-selected').features.length,
      doneRouteCount: data('demo-route-done').features.length,
      nextRouteCount: data('demo-route-next').features.length,
      pointVisibility: map.getLayoutProperty('demo-stop-points', 'visibility'),
      markerVisibility: map.getLayoutProperty('demo-stop-markers', 'visibility'),
      defaultVehiclePixels: pixels('vehicle-marker-default'),
      spotlightVehiclePixels: pixels('vehicle-marker-spotlight'),
      originMarkerPixels: pixels('origin-store-marker'),
      originLayer: {
        type: map.getLayer('demo-origin').type,
        image: map.getLayoutProperty('demo-origin', 'icon-image'),
        labelLayerExists: Boolean(map.getLayer('demo-origin-label')),
      },
      stopSortKeys: {
        point: map.getLayoutProperty('demo-stop-points', 'circle-sort-key'),
        marker: map.getLayoutProperty('demo-stop-markers', 'symbol-sort-key'),
      },
      vehicleLabels: {
        minzoom: map.getLayer('demo-vehicle-labels').minzoom,
        overviewFilter: map.getFilter('demo-vehicle-labels'),
        spotlightFilter: map.getFilter('demo-vehicle-label-spotlight'),
        renderedOverview: map.queryRenderedFeatures({ layers: ['demo-vehicle-labels'] }).length,
        renderedSpotlight: map.queryRenderedFeatures({ layers: ['demo-vehicle-label-spotlight'] }).length,
      },
    };
  });

  const overview = await mapSnapshot();
  expect(overview.vehicles).toHaveLength(8);
  expect(overview.routeCount).toBe(8);
  expect(overview.vehicles.some((vehicle) => vehicle.properties.vehicleId.startsWith('load'))).toBe(false);
  expect(overview.selectedRouteCount).toBe(0);
  expect(overview.origin.geometry.coordinates).toEqual(routeOrigin);
  expect(overview.origin.properties).toEqual({ name: '군포복합물류센터' });
  expect(overview.originLayer).toEqual({ type: 'symbol', image: 'origin-store-marker', labelLayerExists: false });
  expect(overview.originMarkerPixels.opaque).toBeGreaterThan(0);
  expect(overview.routes.every((route) => Math.abs(route.geometry.coordinates[0][0] - routeOrigin[0]) < 0.01 && Math.abs(route.geometry.coordinates[0][1] - routeOrigin[1]) < 0.01)).toBe(true);
  expect(overview.vehicles.every((vehicle) => vehicle.properties.markerImage === 'vehicle-marker-default')).toBe(true);
  expect(overview.defaultVehiclePixels.opaque).toBeGreaterThan(0);
  expect(overview.defaultVehiclePixels.lime).toBe(0);
  expect(overview.spotlightVehiclePixels.opaque).toBeGreaterThan(0);
  expect(overview.spotlightVehiclePixels.lime).toBeGreaterThan(0);
  expect(overview.markerVisibility).toBe('visible');
  expect(overview.pointVisibility).toBe('none');
  expect(overview.stopSortKeys.point).toEqual(['get', 'sortKey']);
  expect(overview.stopSortKeys.marker).toEqual(['get', 'sortKey']);
  expect(overview.vehicleLabels).toMatchObject({ minzoom: 11.3, overviewFilter: ['==', ['get', 'selected'], false], spotlightFilter: ['==', ['get', 'selected'], true] });
  await page.evaluate((center) => window.dsvMap.jumpTo({ center, zoom: 10 }), routeOrigin);
  await expect.poll(async () => (await mapSnapshot()).vehicleLabels.renderedOverview).toBe(0);
  await page.evaluate((center) => window.dsvMap.jumpTo({ center, zoom: 12 }), routeOrigin);
  await expect.poll(async () => (await mapSnapshot()).vehicleLabels.renderedOverview).toBeGreaterThan(0);

  await page.locator('[data-vehicle-id="delay07"]').click();
  await expect(page.locator('[data-vehicle-id="delay07"]')).toHaveClass(/\bactive\b/);
  await expect.poll(async () => (await mapSnapshot()).selectedRouteCount).toBe(1);
  const spotlight = await mapSnapshot();
  expect(spotlight.doneRouteCount).toBe(1);
  expect(spotlight.nextRouteCount).toBe(1);
  await expect.poll(async () => (await mapSnapshot()).vehicleLabels.renderedSpotlight).toBeGreaterThan(0);
  expect(spotlight.vehicles.find((vehicle) => vehicle.properties.vehicleId === 'delay07').properties.markerImage).toBe('vehicle-marker-spotlight');
  expect(spotlight.stops.find((stop) => stop.properties.vehicleId === 'delay07' && stop.properties.stopNo === 6).properties).toMatchObject({ done: true, pinImage: 'stop-pin-done', color: '#8e8e93' });
  expect(spotlight.stops.find((stop) => stop.properties.vehicleId === 'delay07' && stop.properties.stopNo === 7).properties).toMatchObject({ next: true, pinImage: 'stop-pin-selected', color: '#1f8b4c', sortKey: 4000 });
  expect(spotlight.stops.find((stop) => stop.properties.vehicleId === 'delay07' && stop.properties.stopNo === 8).properties).toMatchObject({ selected: true, pinImage: 'stop-pin-default', color: '#0066cc', sortKey: 3000 });
  expect(spotlight.stops.find((stop) => stop.properties.vehicleId === 'to02' && stop.properties.stopNo === 7).properties).toMatchObject({ muted: true, pinImage: 'stop-pin-muted', color: '#8e8e93', sortKey: 1000 });

  await page.getByRole('button', { name: '포인트' }).click();
  await expect.poll(async () => (await mapSnapshot()).pointVisibility).toBe('visible');
  expect((await mapSnapshot()).markerVisibility).toBe('none');

  await page.locator('[data-vehicle-id="delay07"]').click();
  await expect(page.locator('[data-vehicle-id="delay07"]')).not.toHaveClass(/\bactive\b/);
  await expect.poll(async () => (await mapSnapshot()).selectedRouteCount).toBe(0);

  await page.locator('[data-vehicle-id="depart01"]').click();
  await expect.poll(async () => (await mapSnapshot()).nextRouteCount).toBe(1);
  const departure = await mapSnapshot();
  expect(departure.nextRoute.geometry.coordinates[0][0]).toBeCloseTo(routeOrigin[0], 2);
  expect(departure.nextRoute.geometry.coordinates[0][1]).toBeCloseTo(routeOrigin[1], 2);
});

test('destination marker spotlights its vehicle route and zooms to the stop', async ({ page }) => {
  await page.goto('/control');
  await page.waitForFunction(() => window.dsvMap?.getSource('demo-stops'));
  await page.evaluate(async () => {
    const map = window.dsvMap;
    const stop = map.getSource('demo-stops').serialize().data.features.find((feature) => feature.properties.vehicleId === 'to02' && feature.properties.stopNo === 1);
    map.jumpTo({ center: stop.geometry.coordinates, zoom: 14 });
    await new Promise((resolve) => map.once('idle', resolve));
    const point = map.project(stop.geometry.coordinates);
    map.fire('click', { point, lngLat: map.unproject(point) });
  });

  await expect(page.locator('[data-vehicle-id="to02"]')).toHaveClass(/\bactive\b/);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getZoom())).toBeCloseTo(15.7, 1);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getSource('demo-route-selected').serialize().data.features.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getSource('demo-stops').serialize().data.features.filter((feature) => feature.properties.focused).length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getSource('demo-dropoffs').serialize().data.features.length)).toBeGreaterThan(0);
  await expect(page.evaluate(() => window.dsvMap.getLayer('demo-dropoffs').minzoom)).resolves.toBe(15.5);
  await expect(page.evaluate(() => window.dsvMap.getLayer('demo-dropoff-labels').minzoom)).resolves.toBe(15.5);
  await expect(page.evaluate(() => window.dsvMap.getPaintProperty('demo-dropoffs', 'circle-color'))).resolves.toBe('#ff7a00');
  await expect(page.evaluate(() => window.dsvMap.getPaintProperty('demo-dropoff-labels', 'text-color'))).resolves.toBe('#ff7a00');
  await expect(page.evaluate(() => Boolean(window.dsvMap.getLayer('demo-stop-detail-label')))).resolves.toBe(false);

  await page.locator('[data-vehicle-id="delay07"]').click();
  await expect(page.locator('[data-vehicle-id="delay07"]')).toHaveClass(/\bactive\b/);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getZoom())).toBeLessThanOrEqual(12.5);
  await expect.poll(() => page.evaluate(() => window.dsvMap.getSource('demo-stops').serialize().data.features.some((feature) => feature.properties.focused))).toBe(false);
});
