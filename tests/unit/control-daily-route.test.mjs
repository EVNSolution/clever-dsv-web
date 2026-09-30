import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const source = await readFile(new URL('../../src/features/control/control-daily-route.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { dailyRouteTrailLines, inferredTunnelCandidateLines } = await import(moduleUrl);

const observedAt = [
  '2026-09-30T01:47:00.000Z',
  '2026-09-30T01:48:00.000Z',
  '2026-09-30T01:50:00.000Z',
  '2026-09-30T01:51:00.000Z',
  '2026-09-30T01:53:00.000Z',
];
const candidateCoordinates = [
  [126.88213, 37.3694],
  [126.8998493, 37.3716324],
  [126.9264516, 37.3751596],
  [126.93495, 37.37628],
];
const dailyRoute = {
  anchors: observedAt.map((time, coordinateIndex) => ({ coordinateIndex, observedAt: time })),
  bridges: [{
    fromObservedAt: observedAt[2],
    inferredTunnel: {
      confirmedByObservedAt: observedAt[4],
      coordinates: candidateCoordinates,
      corridorId: 'seoul-suam-suri-eastbound',
      fromObservedAt: observedAt[1],
      source: 'CURATED_OSM_TUNNEL_CORRIDOR',
      toObservedAt: observedAt[3],
      type: 'LineString',
    },
    reason: 'IMPLAUSIBLE_JUMP',
    toObservedAt: observedAt[3],
  }],
  coordinates: [[126.87, 37.36], [126.88213, 37.3694], [126.88213, 37.3694], [126.93495, 37.37628], [126.964, 37.38165]],
  sourceSampleCount: observedAt.length,
  type: 'LineString',
};

test('keeps the implausible jump out of observed trail lines', () => {
  assert.deepEqual(dailyRouteTrailLines(dailyRoute), [
    { coordinates: dailyRoute.coordinates.slice(0, 3), uncertain: false },
    { coordinates: dailyRoute.coordinates.slice(3, 5), uncertain: false },
  ]);
});

test('reveals a separate inferred tunnel candidate only after its confirming observation', () => {
  assert.deepEqual(inferredTunnelCandidateLines(dailyRoute, Date.parse(observedAt[3])), []);
  assert.deepEqual(inferredTunnelCandidateLines(dailyRoute, Date.parse(observedAt[4])), [{
    coordinates: candidateCoordinates,
    corridorId: 'seoul-suam-suri-eastbound',
  }]);
  assert.deepEqual(inferredTunnelCandidateLines(dailyRoute), [{
    coordinates: candidateCoordinates,
    corridorId: 'seoul-suam-suri-eastbound',
  }]);
});
