import '../../setupPolyfills';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../context/AuthContext';
import GoogleOneTap, {
  ONE_TAP_DISMISSED_KEY,
  onetapDismissedRecently,
  markOnetapDismissed,
} from './GoogleOneTap';

const ORIG_FETCH = global.fetch;
const ORIG_CLIENT_ID = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;

function installFetchMock() {
  global.fetch = jest.fn((input) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('/api/auth/me')) {
      return Promise.resolve({
        ok: true,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ success: false })),
      });
    }
    if (url.includes('/api/auth/google/nonce')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ success: true, nonce: 'nonce-xyz' })),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{}'),
    });
  });
}

function installGisStub() {
  const calls = { initialize: [], prompt: [] };
  window.google = {
    accounts: {
      id: {
        initialize: (opts) => {
          calls.initialize.push(opts);
        },
        prompt: (notificationCb) => {
          calls.prompt.push(notificationCb);
        },
        disableAutoSelect: () => {},
      },
    },
  };
  return calls;
}

beforeEach(() => {
  process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  installFetchMock();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  if (ORIG_CLIENT_ID === undefined) {
    delete process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
  } else {
    process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = ORIG_CLIENT_ID;
  }
  global.fetch = ORIG_FETCH;
  delete window.google;
});

describe('GoogleOneTap', () => {
  it('renders nothing and short-circuits when Google is unconfigured', async () => {
    delete process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
    const gisCalls = installGisStub();
    const { container } = render(
      <AuthProvider>
        <GoogleOneTap />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(container.innerHTML).toBe('');
    expect(gisCalls.initialize.length).toBe(0);
    expect(gisCalls.prompt.length).toBe(0);
  });

  it('fires prompt with auto_select=true when the user is a guest', async () => {
    const gisCalls = installGisStub();
    render(
      <AuthProvider>
        <GoogleOneTap />
      </AuthProvider>
    );
    await waitFor(() => expect(gisCalls.initialize.length).toBe(1));
    await waitFor(() => expect(gisCalls.prompt.length).toBe(1));
    const init = gisCalls.initialize[0];
    expect(init.auto_select).toBe(true);
    expect(init.nonce).toBe('nonce-xyz');
  });

  it('does not prompt when dismissed within the last 24h', async () => {
    window.localStorage.setItem(ONE_TAP_DISMISSED_KEY, String(Date.now() - 60_000));
    const gisCalls = installGisStub();
    render(
      <AuthProvider>
        <GoogleOneTap />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(gisCalls.prompt.length).toBe(0);
  });

  it('re-prompts when the dismissal is older than 24h', async () => {
    window.localStorage.setItem(
      ONE_TAP_DISMISSED_KEY,
      String(Date.now() - 25 * 60 * 60 * 1000)
    );
    const gisCalls = installGisStub();
    render(
      <AuthProvider>
        <GoogleOneTap />
      </AuthProvider>
    );
    await waitFor(() => expect(gisCalls.prompt.length).toBe(1));
  });

  it('onetapDismissedRecently / markOnetapDismissed round-trip works', () => {
    expect(onetapDismissedRecently()).toBe(false);
    markOnetapDismissed();
    expect(onetapDismissedRecently()).toBe(true);
  });
});
