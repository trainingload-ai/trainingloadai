import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createInternalAdapter } from 'better-auth/db';
import { linkOAuthAccount } from 'better-auth/oauth2';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { oauthAuthorizationWrite } from '../oauth-authorization-revision.ts';

const libraryRequire = createRequire(import.meta.resolve('better-auth/db'));
const { runWithEndpointContext, tryGetCurrentAuthEndpointContext } =
  await import(
    pathToFileURL(libraryRequire.resolve('@better-auth/core/context'))
  );

test('the installed Better Auth atomically rotates a same-row OAuth grant and retains it on refresh', async () => {
  const options = {
    account: {
      modelName: 't_user_accounts',
      additionalFields: {
        authorizationRevision: {
          type: 'string',
          required: false,
          input: false,
        },
      },
      accountLinking: { allowDifferentEmails: true },
    },
  };
  const data = {
    t_user_accounts: [
      {
        id: 'existing-row',
        userId: 'user',
        accountId: '123',
        providerId: 'strava',
        accessToken: 'old-token',
        authorizationRevision: 'old-revision',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
  const adapter = memoryAdapter(data)(options),
    writes = [];
  const originalUpdate = adapter.update.bind(adapter);
  adapter.update = async (args) => {
    writes.push({ path: tryGetCurrentAuthEndpointContext()?.path, ...args });
    return originalUpdate(args);
  };
  const hook = async (account, context) =>
    oauthAuthorizationWrite(account, context);
  const ctx = {
    options,
    hooks: [
      {
        source: 'options',
        hooks: {
          account: { create: { before: hook }, update: { before: hook } },
        },
      },
    ],
    logger: { error() {}, warn() {} },
  };
  ctx.internalAdapter = createInternalAdapter(adapter, ctx);
  ctx.trustedProviders = ['strava'];
  const context = { path: '/callback/strava', context: ctx };
  const result = await runWithEndpointContext(context, () =>
    linkOAuthAccount(context, {
      link: { userId: 'user', email: 'user@example.test' },
      account: {
        accountId: '123',
        providerId: 'strava',
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
      },
      userInfo: { id: '123', email: '123@strava.com', emailVerified: true },
      scopes: ['read'],
    }),
  );
  const row = data.t_user_accounts[0],
    revision = row.authorizationRevision;
  assert.equal(result.linked, true);
  assert.equal(row.id, 'existing-row');
  assert.equal(row.accessToken, 'new-token');
  assert.notEqual(revision, 'old-revision');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].update.accessToken, 'new-token');
  assert.equal(writes[0].update.authorizationRevision, revision);
  await runWithEndpointContext({ path: '/refresh-token', context: ctx }, () =>
    ctx.internalAdapter.updateAccount('existing-row', {
      accessToken: 'refreshed-token',
    }),
  );
  assert.equal(row.authorizationRevision, revision);
  assert.equal(writes[1].update.authorizationRevision, undefined);
});
