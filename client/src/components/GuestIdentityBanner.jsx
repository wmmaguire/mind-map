import React from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import './GuestIdentityBanner.css';

/** Dev preview uses this stable id (matches button copy). */
export const DEV_PREVIEW_USER_ID = 'dev-preview-user';

/**
 * Compact shell strip: guest vs signed-in; dev preview controls on the right (#31 / #33).
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
        </div>
        {devControls && (
          <button
            type="button"
            className="guest-identity-banner__dev-btn"
            onClick={() => setDevRegisteredUserId(DEV_PREVIEW_USER_ID)}
          >
            Preview as {DEV_PREVIEW_USER_ID}
          </button>
        )}
      </aside>
    );
  }

  const displayId =
    userId && userId.length > 28 ? `${userId.slice(0, 26)}…` : userId;

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
          className="guest-identity-banner__id"
          title={userId || ''}
        >
          {displayId || '—'}
        </span>
      </div>
      {devControls && (
        <button
          type="button"
          className="guest-identity-banner__dev-btn"
          onClick={() => setDevRegisteredUserId(null)}
        >
          End preview · Guest
        </button>
      )}
    </aside>
  );
}
