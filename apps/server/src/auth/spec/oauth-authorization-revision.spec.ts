import { oauthAuthorizationWrite } from '../oauth-authorization-revision';

describe('OAuth grant revisions', () => {
  it.each(['/callback/strava', '/callback/polar', '/oauth2/callback/coros'])(
    'rotates a grant on %s while preserving the account row ID',
    (path) => {
      const account = {
        id: 'same-row',
        accessToken: 'new-token',
        authorizationRevision: 'old-grant',
      };
      const next = oauthAuthorizationWrite(account, { path }).data;
      expect(next.id).toBe('same-row');
      expect(next.accessToken).toBe('new-token');
      expect(next.authorizationRevision).not.toBe('old-grant');
      expect(
        oauthAuthorizationWrite(account, { path }).data.authorizationRevision,
      ).not.toBe(next.authorizationRevision);
    },
  );
  it.each(['/get-access-token', '/refresh-token', '/sign-in/email', undefined])(
    'retains the grant for non-callback writes: %s',
    (path) => {
      const account = { id: 'same-row', authorizationRevision: 'grant' };
      expect(oauthAuthorizationWrite(account, { path }).data).toBe(account);
    },
  );
});
