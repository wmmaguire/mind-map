import React from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import './GuestIdentityBanner.css';

/**
 * Shell strip for active account mode: guest session vs signed-in preview / env user (#31 / #33).
 */
export default function GuestIdentityBanner() {
  const {
    identityKind,
    isRegistered,
    userId,
    setDevRegisteredUserId,
  } = useIdentity();

  const devControls =
    process.env.NODE_ENV === 'development' && setDevRegisteredUserId;

  const isGuest = !isRegistered || identityKind === IDENTITY_KIND_GUEST;

  if (isGuest) {
    return (
      <aside
        className="guest-identity-banner guest-identity-banner--guest"
        role="status"
        aria-live="polite"
        aria-label="Account mode"
      >
        <div className="guest-identity-banner__main">
          <span className="guest-identity-banner__label">Guest</span>
          <span className="guest-identity-banner__active" title="Active mode">
            Active: <strong>guest session</strong> (no account id)
          </span>
          <span className="guest-identity-banner__copy">
            Files and graphs are scoped to this browser session. Full sign-in is
            not wired yet.
          </span>
        </div>
        {devControls && (
          <button
            type="button"
            className="guest-identity-banner__dev-btn"
            onClick={() => setDevRegisteredUserId('dev-preview-user')}
          >
            Preview signed-in UI
          </button>
        )}
      </aside>
    );
  }

  const displayId =
    userId && userId.length > 36 ? `${userId.slice(0, 34)}…` : userId;

  return (
    <aside
      className="guest-identity-banner guest-identity-banner--registered"
      role="status"
      aria-live="polite"
      aria-label="Account mode"
    >
      <div className="guest-identity-banner__main">
        <span className="guest-identity-banner__label guest-identity-banner__label--registered">
          Signed in
        </span>
        <span
          className="guest-identity-banner__active"
          title={userId || ''}
        >
          Active: <strong>{displayId || 'account'}</strong>
        </span>
        <span className="guest-identity-banner__copy">
          API calls include your user id for scoped listings when supported.
        </span>
      </div>
      {devControls && (
        <button
          type="button"
          className="guest-identity-banner__dev-btn"
          onClick={() => setDevRegisteredUserId(null)}
        >
          End preview (guest)
        </button>
      )}
    </aside>
  );
}
