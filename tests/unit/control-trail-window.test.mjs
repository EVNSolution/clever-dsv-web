import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const source = await readFile(new URL('../../src/features/control/control-trail-window.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { centerArrivalMs, lastDeliveryFinishedMs, trimTrailHistory } = await import(moduleUrl);

const center = { latitude: 37.3329463, longitude: 126.9381069 };
// 0.0027 degrees of latitude is about 300 m.
const near = { latitude: center.latitude + 0.0010, longitude: center.longitude };
const far = { latitude: center.latitude + 0.0300, longitude: center.longitude };
const times = ['00:00', '06:20', '06:40', '07:10', '09:00', '12:00'].map((time) => `2026-10-13T${time}:00+09:00`);
const at = (index) => Date.parse(times[index]);
const place = [far, near, near, far, far, far];
const samples = times.map((observedAt, index) => ({ observedAt, ...place[index] }));

function history() {
  return {
    dailyRoute: {
      anchors: times.map((observedAt, coordinateIndex) => ({ coordinateIndex, observedAt })),
      bridges: [{ fromObservedAt: times[4], reason: 'GPS_GAP', toObservedAt: times[5] }],
      coordinates: place.map((point) => [point.longitude, point.latitude]),
      sourceSampleCount: 6,
      type: 'LineString',
    },
    serviceDate: '2026-10-13',
    sessions: [{
      segments: [{
        roadMatchedGeometry: {
          anchors: times.map((observedAt, coordinateIndex) => ({ coordinateIndex, lineIndex: 0, observedAt })),
          coordinates: [place.map((point) => [point.longitude, point.latitude])],
          type: 'MultiLineString',
        },
        samples,
        trailMarker: { kind: 'START', observedAt: times[0], ...far },
      }],
    }],
    vehicleId: 'v1',
  };
}

test('center arrival is the first point inside the radius', () => {
  assert.equal(centerArrivalMs(history(), center), at(1));
  assert.equal(centerArrivalMs(history(), center, 50), undefined);
});

test('a history that never reaches the center has no arrival', () => {
  const never = history();
  never.sessions[0].segments[0].samples = samples.filter((_, index) => place[index] === far);
  never.dailyRoute = null;
  assert.equal(centerArrivalMs(never, center), undefined);
});

test('trim keeps only the points from arrival to the last finished stop', () => {
  const trimmed = trimTrailHistory(history(), { endMs: at(4), startMs: at(1) });
  const segment = trimmed.sessions[0].segments[0];
  assert.deepEqual(segment.samples.map((sample) => sample.observedAt), times.slice(1, 5));
  assert.equal(segment.trailMarker, null);
  assert.deepEqual(segment.roadMatchedGeometry.anchors.map((anchor) => anchor.coordinateIndex), [0, 1, 2, 3]);
  assert.equal(segment.roadMatchedGeometry.coordinates[0].length, 4);
  assert.deepEqual(trimmed.dailyRoute.anchors.map((anchor) => anchor.coordinateIndex), [0, 1, 2, 3]);
  assert.equal(trimmed.dailyRoute.coordinates.length, 4);
  assert.equal(trimmed.dailyRoute.bridges.length, 0);
});

test('an open end keeps everything after the arrival', () => {
  const trimmed = trimTrailHistory(history(), { startMs: at(1) });
  assert.equal(trimmed.sessions[0].segments[0].samples.length, 5);
  assert.equal(trimmed.dailyRoute.bridges.length, 1);
});

test('a window with no points empties the history', () => {
  const trimmed = trimTrailHistory(history(), { endMs: at(0) - 1, startMs: at(0) - 60_000 });
  assert.equal(trimmed.sessions.length, 0);
  assert.equal(trimmed.dailyRoute, null);
});

test('the last finished stop is open while any stop is pending', () => {
  const delivered = (occurredAt) => ({ eventSummary: [{ occurredAt, type: 'STOP_DELIVERED' }] });
  assert.equal(
    lastDeliveryFinishedMs([delivered(times[3]), delivered(times[4])]),
    at(4),
  );
  assert.equal(
    lastDeliveryFinishedMs([delivered(times[3]), { eventSummary: [{ occurredAt: times[2], type: 'STOP_ARRIVED' }] }]),
    undefined,
  );
  assert.equal(lastDeliveryFinishedMs([]), undefined);
});
