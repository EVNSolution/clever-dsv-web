import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const source = await readFile(new URL('../../src/services/control-service-window.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText;
const { isVehicleGpsServiceWindow } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const window = {
  endedAt: '2026-10-15T05:16:00.000Z',
  endSource: 'STOP_RESULT',
  startedAt: '2026-10-14T22:53:18.000Z',
  startSource: 'CENTER_STAY',
};

test('accepts the documented service window, with or without an end', () => {
  assert.equal(isVehicleGpsServiceWindow(window), true);
  assert.equal(isVehicleGpsServiceWindow({ ...window, endedAt: null, endSource: null }), true);
  assert.equal(isVehicleGpsServiceWindow({ ...window, endSource: 'STOP_ARRIVED' }), true);
  assert.equal(isVehicleGpsServiceWindow({ ...window, startedAt: '2026-10-14T22:53:18Z' }), true);
});

test('rejects an end source or start source the server does not document', () => {
  assert.equal(isVehicleGpsServiceWindow({ ...window, endSource: 'ROUTE_COMPLETED' }), false);
  assert.equal(isVehicleGpsServiceWindow({ ...window, startSource: 'ROUTE_STARTED' }), false);
});

test('rejects a missing or extra key', () => {
  const { endSource, ...withoutEndSource } = window;
  assert.equal(isVehicleGpsServiceWindow(withoutEndSource), false);
  assert.equal(isVehicleGpsServiceWindow({ ...window, extra: 1 }), false);
  assert.equal(isVehicleGpsServiceWindow({}), false);
});

test('rejects a date that is not a UTC time', () => {
  assert.equal(isVehicleGpsServiceWindow({ ...window, startedAt: '2026-10-15T07:53:18+09:00' }), false);
  assert.equal(isVehicleGpsServiceWindow({ ...window, startedAt: null }), false);
  assert.equal(isVehicleGpsServiceWindow({ ...window, endedAt: 'soon' }), false);
});

test('rejects values that are not an object', () => {
  assert.equal(isVehicleGpsServiceWindow(null), false);
  assert.equal(isVehicleGpsServiceWindow([window]), false);
  assert.equal(isVehicleGpsServiceWindow('CENTER_STAY'), false);
});
