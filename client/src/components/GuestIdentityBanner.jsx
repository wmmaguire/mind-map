import React from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import { useGraphTitle } from '../context/GraphTitleContext';
import './GuestIdentityBanner.css';

/** Dev preview uses this stable id (matches button copy). */
export const DEV_PREVIEW_USER_ID = 'dev-preview-user';

/**
 * Compact shell strip: account mode, optional graph title (from Library), dev preview (#31 / #33).
 */
export default function GuestIdentityBanner() {
  const {
    identityKind,
    isRegistered,
    userId,
    setDevRegisteredUserId,
  } = useIdentity();
  const { graphTitle } = useGraphTitle();

  const devControls =
    process.env.NODE_ENV === 'development' && setDevRegisteredUserId;

  const isGuest = !isRegistered || identityKind === IDENTITY_KIND_GUEST;
  const showTitle = graphTitle != null && graphTitle !== '';

  if (isGuest) {
    return (
      <aside
        className={`guest-identity-banner guest-identity-banner--guest${showTitle ? ' guest-identity-banner--with-title' : ''}`}
        role="status"
        aria-live="polite"
        aria-label="Account mode"
      >
        <div className="guest-identity-banner__main">
          <span className="guest-identity-banner__label">Guest</span>
        </div>
        {showTitle && (
          <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
        )}
        {devControls && (
          <button
            type="button"
            className="guest-identity-banner__label guest-identity-banner__label--action"
            onClick={() => setDevRegisteredUserId(DEV_PREVIEW_USER_ID)}
          >
            Preview {DEV_PREVIEW_USER_ID}
          </button>
        )}
      </aside>
    );
  }

  const displayId =
    userId && userId.length > 28 ? `${userId.slice(0, 26)}…` : userId;

  return (
    <aside
      className={`guest-identity-banner guest-identity-banner--registered${showTitle ? ' guest-identity-banner--with-title' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Account mode"
    >
      <div className="guest-identity-banner__main">
        <span
          className="guest-identity-banner__label guest-identity-banner__label--registered guest-identity-banner__account-label"
          title={userId || ''}
        >
          <span className="guest-identity-banner__account-label-prefix">
            Signed in
          </span>
          <span className="guest-identity-banner__account-label-id">
            {displayId || '—'}
          </span>
        </span>
      </div>
      {showTitle && (
        <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
      )}
      {devControls && (
        <button
          type="button"
          className="guest-identity-banner__label guest-identity-banner__label--action"
          onClick={() => setDevRegisteredUserId(null)}
        >
          End preview
        </button>
      )}
    </aside>
  );
}
