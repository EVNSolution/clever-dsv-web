import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const source = await readFile(new URL('../../src/features/control/control-route-completion.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { lastStopArrivedMs, vehicleRouteCompletions } = await import(moduleUrl);

const times = ['00:00', '06:20', '06:40', '07:10', '09:00', '12:00'].map((time) => `2026-10-13T${time}:00+09:00`);
const at = (index) => Date.parse(times[index]);

test('the route ends at the arrival at the last stop and stays open while a stop is not reached', () => {
  const event = (occurredAt, type) => ({ occurredAt, type });
  const stop = (...events) => ({ eventSummary: events });
  // The arrival ends the route, not the later delivery.
  assert.equal(
    lastStopArrivedMs([
      stop(event(times[2], 'STOP_ARRIVED'), event(times[3], 'STOP_DELIVERED')),
      stop(event(times[3], 'STOP_ARRIVED'), event(times[5], 'STOP_DELIVERED')),
    ]),
    at(3),
  );
  // Without an arrival event, a delivered or failed event stands in for it.
  assert.equal(
    lastStopArrivedMs([stop(event(times[2], 'STOP_DELIVERED')), stop(event(times[4], 'STOP_FAILED'))]),
    at(4),
  );
  // A stop with no event at all is not reached yet.
  assert.equal(lastStopArrivedMs([stop(event(times[2], 'STOP_ARRIVED')), stop(event(times[3], 'ROUTE_STARTED'))]), undefined);
  assert.equal(lastStopArrivedMs([]), undefined);
});

test('a vehicle is listed as finished only when every stop of it was reached', () => {
  const order = (vehicleId, assignmentStatus, ...events) => ({ assignmentStatus, eventSummary: events, vehicleId });
  const arrived = (occurredAt) => ({ occurredAt, type: 'STOP_ARRIVED' });
  const completions = vehicleRouteCompletions([
    order('v-done', 'ASSIGNED', arrived(times[2])),
    order('v-done', 'ASSIGNED', arrived(times[4])),
    order('v-going', 'ASSIGNED', arrived(times[2])),
    order('v-going', 'ASSIGNED'),
    order('v-unassigned', 'UNASSIGNED', arrived(times[2])),
    order(null, 'ASSIGNED', arrived(times[2])),
  ]);
  assert.deepEqual([...completions], [['v-done', new Date(at(4)).toISOString()]]);
});
