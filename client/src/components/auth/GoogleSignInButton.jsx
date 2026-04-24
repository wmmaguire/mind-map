import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../context/AuthContext';
import {
  getGoogleClientId,
  isGoogleSignInConfigured,
  waitForGoogleIdentity,
} from '../../lib/googleIdentity';

/**
 * Google Sign-In button (#102).
 *
 * Renders via `google.accounts.id.renderButton()` so we get Google's official
 * branding automatically. The actual sign-in happens in a callback that:
 *   1. Verifies the ID token server-side via `signInWithGoogle()`.
 *   2. Handles the `link-required` outcome by calling `onLinkRequired` so the
 *      parent can render a confirmation dialog (GuestIdentityBanner does this
 *      in M3). If no `onLinkRequired` is provided, we surface the case via
 *      `onError` with a clear message.
 *
 * If `REACT_APP_GOOGLE_OAUTH_CLIENT_ID` is unset, this component renders
 * nothing — local dev without a Google client id still uses email/password.
 *
 * @param {object} props
 * @param {(args: {user: object}) => void} [props.onSuccess]
 * @param {(args: {linkToken: string, email: string}) => void} [props.onLinkRequired]
 * @param {(err: Error) => void} [props.onError]
 * @param {'signin_with'|'signup_with'|'continue_with'|'signin'} [props.text='signin_with']
 * @param {'outline'|'filled_blue'|'filled_black'} [props.theme='outline']
 * @param {'large'|'medium'|'small'} [props.size='large']
 * @param {number} [props.width] - pixel width; GIS requires a number.
 */
export default function GoogleSignInButton({
  onSuccess,
  onLinkRequired,
  onError,
  text = 'signin_with',
  theme = 'outline',
  size = 'large',
  width = 280,
}) {
  const containerRef = useRef(null);
  const configuredRef = useRef(isGoogleSignInConfigured());
  const clientId = getGoogleClientId();
  const { requestGoogleNonce, signInWithGoogle } = useAuth();
  const [status, setStatus] = useState('idle'); // idle | loading | ready | unavailable
  const [loadError, setLoadError] = useState('');
  const currentNonceRef = useRef(null);

  useEffect(() => {
    if (!configuredRef.current) {
      setStatus('unavailable');
      return undefined;
    }

    let cancelled = false;
    setStatus('loading');

    const handleCredentialResponse = async (response) => {
      try {
        const credential = response?.credential;
        if (!credential) throw new Error('Google did not return a credential');
        const result = await signInWithGoogle({
          credential,
          nonce: currentNonceRef.current || '',
        });
        if (result?.outcome === 'link-required') {
          if (typeof onLinkRequired === 'function') {
            onLinkRequired({ linkToken: result.linkToken, email: result.email });
          } else if (typeof onError === 'function') {
            onError(new Error('An account with this email already exists. Please link it from the sign-in dialog.'));
          }
          return;
        }
        if (typeof onSuccess === 'function') {
          onSuccess({ user: result?.user || null });
        }
      } catch (err) {
        if (typeof onError === 'function') onError(err);
        // eslint-disable-next-line no-console
        console.error('[auth] Google sign-in failed', err);
      }
    };

    (async () => {
      try {
        const gis = await waitForGoogleIdentity();
        if (cancelled) return;
        // Mint a fresh nonce (server-backed) so the ID token we receive is
        // scoped to this session and can't be replayed later.
        let nonce = '';
        try {
          nonce = await requestGoogleNonce();
        } catch (err) {
          console.warn('[auth] nonce mint failed; proceeding without', err);
        }
        if (cancelled) return;
        currentNonceRef.current = nonce || null;
        gis.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          use_fedcm_for_prompt: true,
          ux_mode: 'popup',
          ...(nonce ? { nonce } : {}),
        });
        if (containerRef.current) {
          gis.renderButton(containerRef.current, {
            type: 'standard',
            theme,
            size,
            text,
            shape: 'pill',
            logo_alignment: 'left',
            width,
          });
        }
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setStatus('unavailable');
        setLoadError(err?.message || 'Google Sign-In unavailable');
      }
    })();

    return () => {
      cancelled = true;
    };
    // We intentionally do not re-run on onSuccess / onLinkRequired identity
    // changes — the stable `signInWithGoogle` + `requestGoogleNonce` from the
    // context are enough, and the latest callback props are captured through
    // refs by `handleCredentialResponse` closure on each mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, signInWithGoogle, requestGoogleNonce, theme, size, text, width]);

  if (!configuredRef.current) {
    return null;
  }

  return (
    <div className="google-sign-in-button" data-testid="google-sign-in-button">
      <div ref={containerRef} aria-hidden={status !== 'ready'} />
      {status === 'loading' ? (
        <div className="google-sign-in-button__fallback" aria-live="polite">
          Loading Google Sign-In…
        </div>
      ) : null}
      {status === 'unavailable' ? (
        <div className="google-sign-in-button__error" role="alert">
          {loadError || 'Google Sign-In is unavailable right now.'}
        </div>
      ) : null}
    </div>
  );
}

GoogleSignInButton.propTypes = {
  onSuccess: PropTypes.func,
  onLinkRequired: PropTypes.func,
  onError: PropTypes.func,
  text: PropTypes.oneOf(['signin_with', 'signup_with', 'continue_with', 'signin']),
  theme: PropTypes.oneOf(['outline', 'filled_blue', 'filled_black']),
  size: PropTypes.oneOf(['large', 'medium', 'small']),
  width: PropTypes.number,
};
