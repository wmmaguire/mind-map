import React, { useState, useRef, useEffect } from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import './LibraryAccountChip.css';

/**
 * Library-local account affordance: guest chip vs signed-in menu (#33).
 */
export default function LibraryAccountChip() {
  const {
    identityKind,
    isRegistered,
    userId,
    setDevRegisteredUserId,
  } = useIdentity();
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

  const devControls =
    process.env.NODE_ENV === 'development' && setDevRegisteredUserId;

  if (!isRegistered || identityKind === IDENTITY_KIND_GUEST) {
    return (
      <div className="library-account-chip library-account-chip--guest">
        <span className="library-account-chip__badge" role="status">
          Guest session
        </span>
        <span className="library-account-chip__hint">
          Files and graphs follow this browser session.
        </span>
        {devControls && (
          <div className="library-account-chip__dev">
            <button
              type="button"
              className="library-account-chip__dev-btn"
              onClick={() => setDevRegisteredUserId('dev-preview-user')}
            >
              Preview signed-in UI
            </button>
          </div>
        )}
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
            milestone.
          </div>
          {devControls && (
            <button
              type="button"
              className="library-account-chip__menu-item"
              role="menuitem"
              onClick={() => {
                setDevRegisteredUserId(null);
                setMenuOpen(false);
              }}
            >
              End preview (guest)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
