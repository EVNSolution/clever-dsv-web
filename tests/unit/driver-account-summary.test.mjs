import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const source = await readFile(new URL('../../src/services/driver-account-summary.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 } }).outputText;
const { describeSessionState, parseDriverAccountSummary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('parses the administrator account summary and rejects other shapes', () => {
  assert.deepEqual(parseDriverAccountSummary({
    lastUsedAt: '2026-10-10T02:13:16.894Z', loginId: 'sambongkim', sessionExpiresAt: '2026-10-10T04:42:02.928Z', status: 'ACTIVE',
  }), { lastUsedAt: '2026-10-10T02:13:16.894Z', loginId: 'sambongkim', sessionExpiresAt: '2026-10-10T04:42:02.928Z', status: 'ACTIVE' });
  assert.deepEqual(parseDriverAccountSummary({ loginId: '', status: 'ACTIVE', lastUsedAt: 'not-a-date' }),
    { lastUsedAt: null, loginId: null, sessionExpiresAt: null, status: 'ACTIVE' });
  assert.equal(parseDriverAccountSummary({}), null);
  assert.equal(parseDriverAccountSummary(null), null);
});

test('describes an expired session as needing a new login and a live one as kept', () => {
  const now = Date.parse('2026-10-11T09:00:00Z');
  const expired = describeSessionState({ lastUsedAt: '2026-10-10T02:13:16.894Z', loginId: 'sambongkim', sessionExpiresAt: '2026-10-10T04:42:02.928Z', status: 'ACTIVE' }, now);
  assert.match(expired, /^앱 세션 만료 \(/u);
  assert.match(expired, /재로그인 필요/u);
  const live = describeSessionState({ lastUsedAt: null, loginId: 'x', sessionExpiresAt: '2026-11-10T04:42:02.928Z', status: 'ACTIVE' }, now);
  assert.match(live, /^앱 로그인 유지 중 \(만료 /u);
  assert.equal(describeSessionState({ lastUsedAt: null, loginId: null, sessionExpiresAt: null, status: 'ACTIVE' }, now), '앱 로그인 기록 없음');
});
