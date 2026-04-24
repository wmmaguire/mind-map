import {
  getGoogleClientId,
  isGoogleIdentityReady,
  isGoogleSignInConfigured,
  waitForGoogleIdentity,
} from './googleIdentity';

describe('googleIdentity', () => {
  const originalClientId = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
  const originalGoogle = window.google;

  afterEach(() => {
    if (originalClientId === undefined) {
      delete process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
    } else {
      process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = originalClientId;
    }
    window.google = originalGoogle;
  });

  it('isGoogleSignInConfigured reflects the presence of REACT_APP_GOOGLE_OAUTH_CLIENT_ID', () => {
    process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = '';
    expect(isGoogleSignInConfigured()).toBe(false);
    process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = '  ';
    expect(isGoogleSignInConfigured()).toBe(false);
    process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = 'abc.apps.googleusercontent.com';
    expect(isGoogleSignInConfigured()).toBe(true);
    expect(getGoogleClientId()).toBe('abc.apps.googleusercontent.com');
  });

  it('isGoogleIdentityReady returns false when GIS hasn\'t mounted and true once it has', () => {
    delete window.google;
    expect(isGoogleIdentityReady()).toBe(false);
    window.google = { accounts: { id: { initialize: () => {} } } };
    expect(isGoogleIdentityReady()).toBe(true);
  });

  it('waitForGoogleIdentity resolves as soon as GIS is ready', async () => {
    window.google = { accounts: { id: { initialize: () => {} } } };
    await expect(waitForGoogleIdentity({ timeoutMs: 50 })).resolves.toBeDefined();
  });

  it('waitForGoogleIdentity rejects after the timeout when GIS never loads', async () => {
    delete window.google;
    await expect(waitForGoogleIdentity({ timeoutMs: 30, intervalMs: 10 })).rejects.toThrow(
      /did not load/i
    );
  });
});
