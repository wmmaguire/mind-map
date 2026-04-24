import '../../setupPolyfills';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '../../context/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';

/**
 * These tests exercise the GoogleSignInButton wiring end-to-end against a
 * stubbed `window.google.accounts.id` namespace + a fetch mock for
 * `/api/auth/google/nonce` and `/api/auth/google`. jsdom's default window
 * has no `google.accounts.id`, so the button's `waitForGoogleIdentity`
 * path depends on the stub installed in each test. The `/me` call at
 * `AuthProvider` mount returns a guest so we don't need to gate it.
 */

const ORIG_FETCH = global.fetch;
const ORIG_CLIENT_ID = process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;

function makeFetchMock({ onNonce, onGoogle, onMe } = {}) {
  return jest.fn((input, init) => {
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
      if (onNonce) onNonce({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ success: true, nonce: 'test-nonce' })),
      });
    }
    if (url.includes('/api/auth/google')) {
      const body = init?.body ? JSON.parse(init.body) : {};
      const resp = onGoogle ? onGoogle({ url, init, body }) : null;
      return Promise.resolve(
        resp || {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () =>
            Promise.resolve(
              JSON.stringify({
                success: true,
                outcome: 'new',
                user: { id: 'u_1', email: 'alice@example.com', name: 'Alice', provider: 'google' },
              })
            ),
        }
      );
    }
    if (onMe) onMe({ url, init });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve('{}'),
    });
  });
}

function makeGisStub() {
  const calls = { initialize: [], renderButton: [], disableAutoSelect: 0 };
  let pendingCallback = null;
  const id = {
    initialize: (opts) => {
      calls.initialize.push(opts);
      pendingCallback = opts.callback;
    },
    renderButton: (container, opts) => {
      calls.renderButton.push({ container, opts });
      // Emit a stand-in so tests can `getByRole('button', {name: /sign in/i})` if desired.
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Sign in with Google';
      btn.addEventListener('click', () => {
        if (pendingCallback) {
          pendingCallback({ credential: 'stub-id-token' });
        }
      });
      container.appendChild(btn);
    },
    prompt: () => {},
    disableAutoSelect: () => {
      calls.disableAutoSelect += 1;
    },
  };
  window.google = { accounts: { id } };
  return { calls, triggerCredential: () => pendingCallback && pendingCallback({ credential: 'stub-id-token' }) };
}

beforeEach(() => {
  process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  global.fetch = makeFetchMock();
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

describe('GoogleSignInButton', () => {
  it('renders nothing when REACT_APP_GOOGLE_OAUTH_CLIENT_ID is unset', () => {
    delete process.env.REACT_APP_GOOGLE_OAUTH_CLIENT_ID;
    const { container } = render(
      <AuthProvider>
        <GoogleSignInButton />
      </AuthProvider>
    );
    expect(container.querySelector('[data-testid="google-sign-in-button"]')).toBeNull();
  });

  it('initializes GIS with the client id and a server-minted nonce, then renders the button', async () => {
    const gis = makeGisStub();
    render(
      <AuthProvider>
        <GoogleSignInButton />
      </AuthProvider>
    );
    await waitFor(() => expect(gis.calls.initialize.length).toBe(1));
    const init = gis.calls.initialize[0];
    expect(init.client_id).toBe('test-client-id.apps.googleusercontent.com');
    expect(init.nonce).toBe('test-nonce');
    expect(typeof init.callback).toBe('function');
    await waitFor(() => expect(gis.calls.renderButton.length).toBe(1));
  });

  it('invokes onSuccess with the returned user on a successful exchange', async () => {
    const gis = makeGisStub();
    const onSuccess = jest.fn();
    render(
      <AuthProvider>
        <GoogleSignInButton onSuccess={onSuccess} />
      </AuthProvider>
    );
    await waitFor(() => expect(gis.calls.initialize.length).toBe(1));
    await act(async () => {
      gis.triggerCredential();
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onSuccess.mock.calls[0][0].user.email).toBe('alice@example.com');
  });

  it('invokes onLinkRequired when the server returns 409 LINK_REQUIRED', async () => {
    global.fetch = makeFetchMock({
      onGoogle: () => ({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: false,
              code: 'LINK_REQUIRED',
              error: 'Account exists',
              linkToken: 'link-jwt',
              email: 'alice@example.com',
            })
          ),
      }),
    });
    const gis = makeGisStub();
    const onLinkRequired = jest.fn();
    const onSuccess = jest.fn();
    render(
      <AuthProvider>
        <GoogleSignInButton onSuccess={onSuccess} onLinkRequired={onLinkRequired} />
      </AuthProvider>
    );
    await waitFor(() => expect(gis.calls.initialize.length).toBe(1));
    await act(async () => {
      gis.triggerCredential();
    });
    await waitFor(() => expect(onLinkRequired).toHaveBeenCalled());
    expect(onLinkRequired.mock.calls[0][0]).toEqual({ linkToken: 'link-jwt', email: 'alice@example.com' });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('surfaces invalid-credential failures via onError', async () => {
    global.fetch = makeFetchMock({
      onGoogle: () => ({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: false, code: 'INVALID_GOOGLE_CREDENTIAL', error: 'bad token' })
          ),
      }),
    });
    const gis = makeGisStub();
    const onError = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AuthProvider>
        <GoogleSignInButton onError={onError} />
      </AuthProvider>
    );
    await waitFor(() => expect(gis.calls.initialize.length).toBe(1));
    await act(async () => {
      gis.triggerCredential();
    });
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    errorSpy.mockRestore();
  });
});

describe('AuthProvider.logout + Google disableAutoSelect', () => {
  it('calls google.accounts.id.disableAutoSelect when it exists during logout', async () => {
    const gis = makeGisStub();
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
      if (url.includes('/api/auth/logout')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{}'),
      });
    });

    let captured = null;
    function Harness() {
      const auth = require('../../context/AuthContext').useAuth();
      captured = auth;
      return null;
    }
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>
    );
    await waitFor(() => expect(captured).not.toBeNull());
    await act(async () => {
      await captured.logout();
    });
    expect(gis.calls.disableAutoSelect).toBe(1);
  });
});
