import React, { useEffect, useRef, useState } from 'react';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import { useGraphTitle } from '../context/GraphTitleContext';
import { useLibraryUi } from '../context/LibraryUiContext';
import './GuestIdentityBanner.css';

/** Dev preview uses this stable id (matches button copy). */
export const DEV_PREVIEW_USER_ID = 'dev-preview-user';

/**
 * Shell strip: centered graph title; **account identity and actions** consolidated in the
 * trailing control (guest preview button or signed-in menu) — #31 / #33.
 */
export default function GuestIdentityBanner() {
  const {
    identityKind,
    isRegistered,
    userId,
    setDevRegisteredUserId,
  } = useIdentity();
  const { graphTitle } = useGraphTitle();
  const { mobileRailVisible, openMobileLibrary } = useLibraryUi();

  const devControls =
    process.env.NODE_ENV === 'development' && setDevRegisteredUserId;

  const isGuest = !isRegistered || identityKind === IDENTITY_KIND_GUEST;
  const showTitle = graphTitle != null && graphTitle !== '';

  const displayId =
    userId && userId.length > 28 ? `${userId.slice(0, 26)}…` : userId;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (isGuest) {
    return (
      <aside
        className={`guest-identity-banner guest-identity-banner--guest${showTitle ? ' guest-identity-banner--with-title' : ''}`}
        role="status"
        aria-live="polite"
        aria-label="Account mode"
      >
        <div className="guest-identity-banner__leading">
          {mobileRailVisible && (
            <button
              type="button"
              className="library-mobile-rail library-mobile-rail--banner"
              onClick={openMobileLibrary}
              aria-label="Open Library"
            >
              <span className="library-mobile-rail__icon" aria-hidden>
                📚
              </span>
              <span className="library-mobile-rail__label">Library</span>
            </button>
          )}
          {!(devControls) && (
            <span className="guest-identity-banner__label">Guest</span>
          )}
        </div>
        {showTitle ? (
          <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
        ) : (
          <div
            className="guest-identity-banner__center-gap"
            aria-hidden
          />
        )}
        <div className="guest-identity-banner__trailing">
          {devControls && (
            <button
              type="button"
              className="guest-identity-banner__account-control guest-identity-banner__account-control--guest-preview"
              onClick={() => setDevRegisteredUserId(DEV_PREVIEW_USER_ID)}
            >
              <span className="guest-identity-banner__account-control-primary">
                Guest
              </span>
              <span className="guest-identity-banner__account-control-secondary">
                Preview {DEV_PREVIEW_USER_ID}
              </span>
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`guest-identity-banner guest-identity-banner--registered${showTitle ? ' guest-identity-banner--with-title' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Account mode"
    >
      <div className="guest-identity-banner__leading">
        {mobileRailVisible && (
          <button
            type="button"
            className="library-mobile-rail library-mobile-rail--banner"
            onClick={openMobileLibrary}
            aria-label="Open Library"
          >
            <span className="library-mobile-rail__icon" aria-hidden>
              📚
            </span>
            <span className="library-mobile-rail__label">Library</span>
          </button>
        )}
      </div>
      {showTitle ? (
        <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
      ) : (
        <div className="guest-identity-banner__center-gap" aria-hidden />
      )}
      <div
        className="guest-identity-banner__trailing"
        ref={devControls ? menuWrapRef : undefined}
      >
        {devControls ? (
          <>
            <button
              type="button"
              className="guest-identity-banner__account-control guest-identity-banner__account-control--registered-trigger"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="guest-identity-banner__account-control-primary">
                Signed in
              </span>
              <span
                className="guest-identity-banner__account-control-id"
                title={userId || ''}
              >
                {displayId || '—'}
              </span>
              <span className="guest-identity-banner__account-control-chevron" aria-hidden>
                {menuOpen ? '▴' : '▾'}
              </span>
            </button>
            {menuOpen && (
              <div className="guest-identity-banner__menu" role="menu">
                <div className="guest-identity-banner__menu-meta" role="none">
                  Active account
                </div>
                <div
                  className="guest-identity-banner__menu-id"
                  role="none"
                  title={userId || ''}
                >
                  {userId || '—'}
                </div>
                <button
                  type="button"
                  className="guest-identity-banner__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setDevRegisteredUserId(null);
                    setMenuOpen(false);
                  }}
                >
                  End preview (guest)
                </button>
              </div>
            )}
          </>
        ) : (
          <span
            className="guest-identity-banner__account-static"
            title={userId || ''}
          >
            <span className="guest-identity-banner__account-static-prefix">
              Signed in
            </span>
            <span className="guest-identity-banner__account-static-id">
              {displayId || '—'}
            </span>
          </span>
        )}
      </div>
    </aside>
  );
}
