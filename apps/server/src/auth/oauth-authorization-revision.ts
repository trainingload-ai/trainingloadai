import { randomUUID } from 'node:crypto';

/** OAuth callbacks replace grants; ordinary token refreshes retain their revision. */
export function oauthAuthorizationWrite<T extends Record<string, unknown>>(
  account: T,
  context: { path?: string } | null | undefined,
) {
  if (!/^\/(?:oauth2\/)?callback(?:\/|$)/.test(context?.path ?? ''))
    return { data: account };
  return { data: { ...account, authorizationRevision: randomUUID() } };
}
