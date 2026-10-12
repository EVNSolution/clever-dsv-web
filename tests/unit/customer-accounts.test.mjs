import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { transpileModule, ModuleKind, ScriptTarget } = require('typescript');

const calls = [];
const responses = [];
globalThis.__customerAccountsStub = {
  request(path, options) {
    calls.push({ path, options });
    return Promise.resolve(responses.shift());
  },
};
const stubUrl = `data:text/javascript;base64,${Buffer.from(`
  const stub = globalThis.__customerAccountsStub;
  export const requestLegacyJson = (path, options) => stub.request(path, options);
  export const requestV1ReadJson = (path, options) => stub.request(path, options);
  export const apiConfig = { mode: 'remote', shopDomain: 'dsv-demo.local' };
  export const clearTransportSession = () => {};
  export const storeAuthToken = () => {};
  export const storeCsrfToken = () => {};
`).toString('base64')}`;

const source = await readFile(new URL('../../src/services/customer-accounts.ts', import.meta.url), 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
}).outputText.replace(/from '\.\.\/api\/[a-z-]+'/gu, `from '${stubUrl}'`);
const { discardCustomerAccount, sendCustomerAccountPasswordReset } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const account = {
  displayName: '담당자',
  email: null,
  id: 'account-1',
  invitedAt: null,
  inviteExpiresAt: null,
  lastAuthenticatedAt: '2026-10-12T00:00:00.000Z',
  loginId: 'customer.one',
  status: 'ACTIVE',
};

test('password reset returns the one-time setup link instead of sending email', async () => {
  calls.length = 0;
  responses.push({ account, invitation: { expiresAt: '2026-10-14T00:00:00.000Z', setupUrl: 'https://dsv.example/customer/account/setup#token=abc' } });

  const issue = await sendCustomerAccountPasswordReset('account-1');

  assert.deepEqual(calls, [{ path: 'customer-accounts/account-1/password-reset', options: { method: 'POST' } }]);
  assert.equal(issue.account.loginId, 'customer.one');
  assert.equal(issue.invitation.setupUrl, 'https://dsv.example/customer/account/setup#token=abc');
});

test('password reset rejects a response without a setup link', async () => {
  responses.push({ account });
  await assert.rejects(sendCustomerAccountPasswordReset('account-1'), /고객 계정 초대 응답 형식/u);
});

test('discard deletes the unclaimed account and returns its id', async () => {
  calls.length = 0;
  responses.push({ accountId: 'account-2' });

  assert.equal(await discardCustomerAccount('account-2'), 'account-2');
  assert.deepEqual(calls, [{ path: 'customer-accounts/account-2', options: { method: 'DELETE' } }]);
});

test('discard rejects a response without the account id', async () => {
  responses.push({});
  await assert.rejects(discardCustomerAccount('account-2'), /고객 계정 응답 형식/u);
});
