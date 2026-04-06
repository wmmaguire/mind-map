import React from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import './GuestIdentityBanner.css';

/**
 * Shell notice for guest-only mode (#31 epic). Hidden once a registered account exists.
 */
export default function GuestIdentityBanner() {
  const { identityKind, isRegistered } = useIdentity();

  if (isRegistered || identityKind !== IDENTITY_KIND_GUEST) {
    return null;
  }

  return (
    <aside
      className="guest-identity-banner"
      role="status"
      aria-live="polite"
      aria-label="Account mode"
    >
      <span className="guest-identity-banner__label">Guest</span>
      <span className="guest-identity-banner__copy">
        Files and graphs are scoped to this browser session. Sign-in and saved
        accounts are not available yet.
      </span>
    </aside>
  );
}
