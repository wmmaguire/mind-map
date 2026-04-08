import React, { useState, useRef, useEffect } from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import './LibraryAccountChip.css';

/**
 * Library-local account affordance: mirrors shell identity (guest vs signed-in) (#33).
 * Dev preview controls live on {@link GuestIdentityBanner}.
 */
export default function LibraryAccountChip() {
  const { identityKind, isRegistered, userId } = useIdentity();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (!isRegistered || identityKind === IDENTITY_KIND_GUEST) {
    return (
      <div className="library-account-chip library-account-chip--guest">
        <span className="library-account-chip__badge" role="status">
          Guest session
        </span>
        <span className="library-account-chip__hint">
          Files and graphs follow this browser session. See the banner for
          active mode.
        </span>
      </div>
    );
  }

  const shortId =
    userId && userId.length > 14 ? `${userId.slice(0, 12)}…` : userId;

  return (
    <div
      className="library-account-chip library-account-chip--registered"
      ref={wrapRef}
    >
      <button
        type="button"
        className="library-account-chip__trigger"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span className="library-account-chip__badge">Signed in</span>
        <span className="library-account-chip__id" title={userId || ''}>
          {shortId}
        </span>
        <span className="library-account-chip__chevron" aria-hidden>
          {menuOpen ? '▲' : '▼'}
        </span>
      </button>
      {menuOpen && (
        <div className="library-account-chip__menu" role="menu">
          <div className="library-account-chip__menu-note" role="none">
            Account features (sign out, profile) will connect here in a later
            milestone. Active account is shown in the top banner.
          </div>
        </div>
      )}
    </div>
  );
}
