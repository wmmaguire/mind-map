import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  getGoogleClientId,
  isGoogleSignInConfigured,
  waitForGoogleIdentity,
} from '../../lib/googleIdentity';

const ONE_TAP_DISMISSED_KEY = 'mindmap.auth.onetap.dismissedAt';
const ONE_TAP_DISMISSED_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function onetapDismissedRecently(now = Date.now()) {
  try {
    const raw = window.localStorage.getItem(ONE_TAP_DISMISSED_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return now - ts < ONE_TAP_DISMISSED_TTL_MS;
  } catch {
    return false;
  }
}

function markOnetapDismissed() {
  try {
    window.localStorage.setItem(ONE_TAP_DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore quota / disabled storage; fall back to re-prompting next load.
  }
}

/**
 * Headless component that fires `google.accounts.id.prompt()` once per app
 * boot when:
 *   - Google Sign-In is configured (client id env is set),
 *   - The user isn't already authenticated,
 *   - The user hasn't dismissed One Tap in the last 24h (localStorage flag),
 *   - The tab is currently visible.
 *
 * `auto_select: true` means a single-Google-account user who has previously
 * signed into MindMap and still has consent will be signed in silently, with
 * no UI — which is the "automatic sign-in" user-facing goal of #102.
 *
 * Dismissal of the prompt (user closes or is blocked by browser settings) is
 * recorded in localStorage so we don't nag on every navigation.
 *
 * Renders nothing; safe to mount unconditionally.
 */
export default function GoogleOneTap() {
  const { status, requestGoogleNonce, signInWithGoogle } = useAuth();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return undefined;
    if (!isGoogleSignInConfigured()) return undefined;
    if (status !== 'guest') return undefined;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return undefined;
    if (onetapDismissedRecently()) return undefined;

    let cancelled = false;
    firedRef.current = true;

    (async () => {
      try {
        const gis = await waitForGoogleIdentity({ timeoutMs: 5000 });
        if (cancelled) return;
        let nonce = '';
        try {
          nonce = await requestGoogleNonce();
        } catch {
          // non-fatal; proceed without nonce (server-side check is permissive
          // when the client doesn't send one)
        }
        if (cancelled) return;
        gis.initialize({
          client_id: getGoogleClientId(),
          callback: async (response) => {
            if (cancelled) return;
            const credential = response?.credential;
            if (!credential) return;
            try {
              const result = await signInWithGoogle({ credential, nonce });
              if (result?.outcome === 'link-required') {
                // One Tap is best-effort; deferring the link dialog to the
                // modal flow avoids surprising the user with it mid-page.
                return;
              }
            } catch (err) {
              console.warn('[auth] One Tap sign-in failed', err);
            }
          },
          auto_select: true,
          use_fedcm_for_prompt: true,
          cancel_on_tap_outside: true,
          ...(nonce ? { nonce } : {}),
        });
        gis.prompt((notification) => {
          try {
            if (
              notification?.isNotDisplayed?.() ||
              notification?.isSkippedMoment?.() ||
              notification?.isDismissedMoment?.()
            ) {
              markOnetapDismissed();
            }
          } catch {
            markOnetapDismissed();
          }
        });
      } catch (err) {
        // GIS script didn't load; fall back to the explicit sign-in button.
        console.warn('[auth] Google One Tap unavailable', err?.message || err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, requestGoogleNonce, signInWithGoogle]);

  return null;
}

export {
  ONE_TAP_DISMISSED_KEY,
  ONE_TAP_DISMISSED_TTL_MS,
  onetapDismissedRecently,
  markOnetapDismissed,
};
