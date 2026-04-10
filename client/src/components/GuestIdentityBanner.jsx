import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import { useAuth } from '../context/AuthContext';
import { useGraphTitle } from '../context/GraphTitleContext';
import { useLibraryUi } from '../context/LibraryUiContext';
import { useGraphChromeUi } from '../context/GraphChromeUiContext';
import { useGraphHistoryUi } from '../context/GraphHistoryUiContext';
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
  const {
    status: authStatus,
    user: authUser,
    login,
    register,
    logout,
    updateProfile,
  } = useAuth();
  const { graphTitle } = useGraphTitle();
  const { mobileRailVisible, openMobileLibrary } = useLibraryUi();
  const { pathname } = useLocation();
  const {
    playbackStripVisible,
    graphSearchBarVisible,
    togglePlaybackStrip,
    toggleGraphSearchBar,
  } = useGraphChromeUi();
  const { sharePayload } = useGraphHistoryUi();
  const onVisualizeRoute = pathname === '/visualize';

  // Dev-only preview is now opt-in so real auth UI is testable in development (#63).
  // Set REACT_APP_ENABLE_DEV_PREVIEW=true to restore the old behavior.
  const devControls =
    process.env.NODE_ENV === 'development' &&
    process.env.REACT_APP_ENABLE_DEV_PREVIEW === 'true' &&
    setDevRegisteredUserId;

  const isGuest = !isRegistered || identityKind === IDENTITY_KIND_GUEST;
  const showTitle = graphTitle != null && graphTitle !== '';

  const displayId =
    userId && userId.length > 28 ? `${userId.slice(0, 26)}…` : userId;

  const accountSubtitle = authUser?.name?.trim()
    ? authUser.name.length > 28
      ? `${authUser.name.slice(0, 26)}…`
      : authUser.name
    : displayId;

  /** Registered trigger chip: at most 4 visible characters, one line; chevron (#86efac) stays on the right. */
  const ACCOUNT_TRIGGER_LABEL_MAX = 4;
  const accountTriggerLabel = (() => {
    const raw = accountSubtitle;
    if (raw == null || String(raw).trim() === '') return '—';
    const s = String(raw).trim();
    if (s.length <= ACCOUNT_TRIGGER_LABEL_MAX) return s;
    return s.slice(0, ACCOUNT_TRIGGER_LABEL_MAX);
  })();

  const [menuOpen, setMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // login | register
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    if (!menuOpen && !viewMenuOpen) return;
    const onDoc = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
        setViewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen, viewMenuOpen]);

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
        </div>
        <div className="guest-identity-banner__center-stack">
          {showTitle ? (
            <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
          ) : (
            <div
              className="guest-identity-banner__center-gap"
              aria-hidden
            />
          )}
        </div>
        <div className="guest-identity-banner__trailing">
          <div className="guest-identity-banner__trailing-cluster">
            {onVisualizeRoute && sharePayload ? (
              <button
                type="button"
                className="guest-identity-banner__library-share-btn guest-identity-banner__library-share-btn--title-row"
                onClick={sharePayload.onShareClick}
                aria-label="Copy read-only share link to clipboard"
              >
                SHARE
              </button>
            ) : null}
            {onVisualizeRoute ? (
              <div className="guest-identity-banner__view-wrap">
                <button
                  type="button"
                  className="guest-identity-banner__view-trigger"
                  aria-expanded={viewMenuOpen}
                  aria-haspopup="menu"
                  aria-controls="guest-chrome-view-menu"
                  id="guest-chrome-view-trigger"
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMenuOpen((o) => !o);
                  }}
                >
                  <span className="guest-identity-banner__view-trigger-label">View</span>
                  <span className="guest-identity-banner__account-control-chevron" aria-hidden>
                    {viewMenuOpen ? '▴' : '▾'}
                  </span>
                </button>
                {viewMenuOpen ? (
                  <div
                    id="guest-chrome-view-menu"
                    className="guest-identity-banner__menu guest-identity-banner__menu--view"
                    role="menu"
                    aria-labelledby="guest-chrome-view-trigger"
                  >
                    <button
                      type="button"
                      className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                      role="menuitemcheckbox"
                      aria-checked={playbackStripVisible}
                      onClick={() => togglePlaybackStrip()}
                    >
                      <span className="guest-identity-banner__menu-check" aria-hidden>
                        {playbackStripVisible ? '✓' : '○'}
                      </span>
                      Playback
                    </button>
                    <button
                      type="button"
                      className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                      role="menuitemcheckbox"
                      aria-checked={graphSearchBarVisible}
                      onClick={() => toggleGraphSearchBar()}
                    >
                      <span className="guest-identity-banner__menu-check" aria-hidden>
                        {graphSearchBarVisible ? '✓' : '○'}
                      </span>
                      Search
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {devControls ? (
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
            ) : (
              <button
                type="button"
                className="guest-identity-banner__account-control guest-identity-banner__account-control--guest-preview"
                onClick={() => {
                  setAuthMode('login');
                  setAuthModalOpen(true);
                }}
              >
                <span className="guest-identity-banner__account-control-primary">
                  {authStatus === 'loading' ? 'Checking…' : 'Sign in'}
                </span>
                <span className="guest-identity-banner__account-control-secondary">
                  Create account
                </span>
              </button>
            )}
          </div>
        </div>
        {authModalOpen ? (
          <div className="guest-identity-banner__auth-overlay" role="dialog" aria-label="Account">
            <div className="guest-identity-banner__auth-modal">
              <div className="guest-identity-banner__auth-header">
                <strong>{authMode === 'login' ? 'Sign in' : 'Create account'}</strong>
                <button
                  type="button"
                  className="guest-identity-banner__auth-close"
                  onClick={() => setAuthModalOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="guest-identity-banner__auth-tabs" role="tablist" aria-label="Auth mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'login'}
                  className={`guest-identity-banner__auth-tab ${authMode === 'login' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'register'}
                  className={`guest-identity-banner__auth-tab ${authMode === 'register' ? 'is-active' : ''}`}
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                >
                  Create account
                </button>
              </div>
              <form
                className="guest-identity-banner__auth-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthBusy(true);
                  setAuthError('');
                  try {
                    if (authMode === 'login') {
                      await login({ email: authEmail, password: authPassword });
                    } else {
                      await register({
                        name: authName,
                        email: authEmail,
                        password: authPassword
                      });
                    }
                    setAuthModalOpen(false);
                  } catch (err) {
                    setAuthError(err?.message || 'Auth failed');
                  } finally {
                    setAuthBusy(false);
                  }
                }}
              >
                {authMode === 'register' ? (
                  <label className="guest-identity-banner__auth-field">
                    Name
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      autoComplete="name"
                      placeholder="e.g. Max"
                    />
                  </label>
                ) : null}
                <label className="guest-identity-banner__auth-field">
                  Email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="guest-identity-banner__auth-field">
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                </label>
                {authError ? (
                  <div className="guest-identity-banner__auth-error" role="alert">
                    {authError}
                  </div>
                ) : null}
                <div className="guest-identity-banner__auth-actions">
                  <button type="submit" disabled={authBusy}>
                    {authBusy ? 'Working…' : authMode === 'login' ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
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
      <div className="guest-identity-banner__center-stack">
        {showTitle ? (
          <h2 className="guest-identity-banner__graph-title">{graphTitle}</h2>
        ) : (
          <div className="guest-identity-banner__center-gap" aria-hidden />
        )}
      </div>
      <div
        className="guest-identity-banner__trailing"
        ref={menuWrapRef}
      >
        <div className="guest-identity-banner__trailing-cluster">
          {onVisualizeRoute && sharePayload ? (
            <button
              type="button"
              className="guest-identity-banner__library-share-btn guest-identity-banner__library-share-btn--title-row"
              onClick={sharePayload.onShareClick}
              aria-label="Copy read-only share link to clipboard"
            >
              SHARE
            </button>
          ) : null}
          {onVisualizeRoute ? (
            <div className="guest-identity-banner__view-wrap">
              <button
                type="button"
                className="guest-identity-banner__view-trigger"
                aria-expanded={viewMenuOpen}
                aria-haspopup="menu"
                aria-controls="guest-chrome-view-menu-reg"
                id="guest-chrome-view-trigger-reg"
                onClick={() => {
                  setMenuOpen(false);
                  setViewMenuOpen((o) => !o);
                }}
              >
                <span className="guest-identity-banner__view-trigger-label">View</span>
                <span className="guest-identity-banner__account-control-chevron" aria-hidden>
                  {viewMenuOpen ? '▴' : '▾'}
                </span>
              </button>
              {viewMenuOpen ? (
                <div
                  id="guest-chrome-view-menu-reg"
                  className="guest-identity-banner__menu guest-identity-banner__menu--view"
                  role="menu"
                  aria-labelledby="guest-chrome-view-trigger-reg"
                >
                  <button
                    type="button"
                    className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                    role="menuitemcheckbox"
                    aria-checked={playbackStripVisible}
                    onClick={() => togglePlaybackStrip()}
                  >
                    <span className="guest-identity-banner__menu-check" aria-hidden>
                      {playbackStripVisible ? '✓' : '○'}
                    </span>
                    Playback
                  </button>
                  <button
                    type="button"
                    className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                    role="menuitemcheckbox"
                    aria-checked={graphSearchBarVisible}
                    onClick={() => toggleGraphSearchBar()}
                  >
                    <span className="guest-identity-banner__menu-check" aria-hidden>
                      {graphSearchBarVisible ? '✓' : '○'}
                    </span>
                    Search
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="guest-identity-banner__account-control guest-identity-banner__account-control--registered-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={
              accountSubtitle || displayId
                ? `Open account menu (${accountSubtitle || displayId})`
                : 'Open account menu'
            }
            onClick={() => {
              setViewMenuOpen(false);
              setMenuOpen((o) => !o);
            }}
          >
            <span
              className="guest-identity-banner__account-control-id guest-identity-banner__account-control-id--trigger"
              title={authUser?.name?.trim() ? authUser.name : userId || ''}
            >
              {accountTriggerLabel}
            </span>
            <span className="guest-identity-banner__account-control-chevron" aria-hidden>
              {menuOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>
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
            {authStatus === 'authenticated' && authUser ? (
              <button
                type="button"
                className="guest-identity-banner__menu-item"
                role="menuitem"
                onClick={() => {
                  setSettingsName(authUser.name || '');
                  setSettingsError('');
                  setSettingsOpen(true);
                  setMenuOpen(false);
                }}
              >
                User settings
              </button>
            ) : null}
            <button
              type="button"
              className="guest-identity-banner__menu-item"
              role="menuitem"
              onClick={async () => {
                await logout();
                setMenuOpen(false);
              }}
            >
              Sign out
            </button>
          </div>
        )}
        {settingsOpen && authUser ? (
          <div className="guest-identity-banner__auth-overlay" role="dialog" aria-label="Account settings">
            <div className="guest-identity-banner__auth-modal">
              <div className="guest-identity-banner__auth-header">
                <strong>Account settings</strong>
                <button
                  type="button"
                  className="guest-identity-banner__auth-close"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <form
                className="guest-identity-banner__auth-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSettingsBusy(true);
                  setSettingsError('');
                  try {
                    await updateProfile({ name: settingsName });
                    setSettingsOpen(false);
                  } catch (err) {
                    setSettingsError(err?.message || 'Could not save');
                  } finally {
                    setSettingsBusy(false);
                  }
                }}
              >
                <label className="guest-identity-banner__auth-field">
                  Name
                  <input
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    autoComplete="name"
                    maxLength={120}
                    placeholder="Display name"
                  />
                </label>
                <label className="guest-identity-banner__auth-field guest-identity-banner__auth-field--readonly">
                  Email
                  <input type="email" value={authUser.email || ''} readOnly tabIndex={-1} />
                </label>
                <p className="guest-identity-banner__settings-hint">
                  Email cannot be changed here.
                </p>
                {settingsError ? (
                  <div className="guest-identity-banner__auth-error" role="alert">
                    {settingsError}
                  </div>
                ) : null}
                <div className="guest-identity-banner__auth-actions guest-identity-banner__auth-actions--split">
                  <button type="button" disabled={settingsBusy} onClick={() => setSettingsOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={settingsBusy}>
                    {settingsBusy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
