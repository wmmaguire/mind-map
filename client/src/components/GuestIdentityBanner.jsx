import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  IDENTITY_KIND_GUEST,
  useIdentity,
} from '../context/IdentityContext';
import { useAuth } from '../context/AuthContext';
import { useGraphTitle } from '../context/GraphTitleContext';
import { useLibraryUi } from '../context/LibraryUiContext';
import { useGraphChromeUi } from '../context/GraphChromeUiContext';
import { useGraphHistoryUi } from '../context/GraphHistoryUiContext';
import BannerActionsDrawer from './BannerActionsDrawer';
import './GuestIdentityBanner.css';

/** Dev preview uses this stable id (matches button copy). */
export const DEV_PREVIEW_USER_ID = 'dev-preview-user';

/**
 * Shell strip: centered graph title; **account identity and actions** consolidated in the
 * trailing control (guest preview button or signed-in menu) — #31 / #33.
 *
 * @param {{ onOpenUpload?: () => void }} props
 */
export default function GuestIdentityBanner({ onOpenUpload = () => {} }) {
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
    requestPasswordReset,
  } = useAuth();
  const { graphTitle } = useGraphTitle();
  const { openMobileLibrary } = useLibraryUi();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const showHomeNav = pathname !== '/';
  const onLandingRoute = pathname === '/';
  const shareViewerMode =
    pathname === '/visualize' &&
    Boolean(searchParams.get('shareGraph')?.trim()) &&
    Boolean(searchParams.get('shareToken')?.trim());
  const {
    playbackStripVisible,
    graphSearchBarVisible,
    insightsPanelVisible,
    togglePlaybackStrip,
    toggleGraphSearchBar,
    toggleInsightsPanel,
    resetGraphView,
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
  const [authMode, setAuthMode] = useState('login'); // login | register | forgot-password
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [forgotEmailSent, setForgotEmailSent] = useState(false);

  const closeAuthModal = () => {
    setAuthModalOpen(false);
    setForgotEmailSent(false);
    setAuthError('');
  };

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

  // Mobile banner actions drawer (#90). Desktop keeps the inline chip cluster.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mobileMenuTriggerRef = useRef(null);

  // Auto-close the drawer on route change so users never land on a new page with
  // a stale menu overlay blocking the view.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Right-edge swipe-to-open: only active on narrow viewports, direction-locked
  // to horizontal so it can't steal vertical scroll gestures. The hint is a
  // progressive-enhancement — the Menu chip remains the discoverable entry point.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const EDGE_PX = 24;
    const OPEN_DX = -60; // leftward drag from right edge
    const NARROW_PX = 576; // matches @media (max-width: 36rem)
    let startX = null;
    let startY = null;
    let tracking = false;
    const reset = () => {
      startX = null;
      startY = null;
      tracking = false;
    };
    const isNarrow = () => window.innerWidth <= NARROW_PX;
    const onStart = (e) => {
      if (drawerOpen || !isNarrow()) return;
      const t = e.touches?.[0];
      if (!t) return;
      if (window.innerWidth - t.clientX > EDGE_PX) return;
      startX = t.clientX;
      startY = t.clientY;
      tracking = true;
    };
    const onMove = (e) => {
      if (!tracking || startX == null) return;
      const t = e.touches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) > Math.abs(dy) * 2 && dx < OPEN_DX) {
        reset();
        setDrawerOpen(true);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', reset, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', reset);
      document.removeEventListener('touchcancel', reset);
    };
  }, [drawerOpen]);

  const openDrawer = () => {
    // Dismiss desktop popovers so we never stack menus when the user reaches
    // for the mobile drawer on a hybrid (keyboard+touch) device.
    setMenuOpen(false);
    setViewMenuOpen(false);
    setDrawerOpen(true);
  };
  const closeDrawer = () => setDrawerOpen(false);

  if (isGuest) {
    return (
      <aside
        className={`guest-identity-banner guest-identity-banner--guest${showTitle ? ' guest-identity-banner--with-title' : ''}`}
        role="status"
        aria-live="polite"
        aria-label="Account mode"
      >
        <div className="guest-identity-banner__leading">
          {showHomeNav ? (
            <button
              type="button"
              className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__home-banner"
              onClick={() => navigate('/')}
              aria-label="Go to home"
            >
              <span className="library-mobile-rail__icon" aria-hidden>
                🏠
              </span>
              <span className="library-mobile-rail__label">Home</span>
            </button>
          ) : null}
          {onLandingRoute ? (
            <button
              type="button"
              className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__visualize-banner"
              aria-label="Visualize: open library and network graphs"
              onClick={() => navigate('/visualize')}
            >
              <span className="library-mobile-rail__icon" aria-hidden>
                🔍
              </span>
              <span className="library-mobile-rail__label">Visualize</span>
            </button>
          ) : null}
          {onVisualizeRoute ? (
            <button
              type="button"
              className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__library-banner"
              onClick={openMobileLibrary}
              aria-label="Open Library"
            >
              <span className="library-mobile-rail__icon" aria-hidden>
                📚
              </span>
              <span className="library-mobile-rail__label">Library</span>
            </button>
          ) : null}
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
          <div className="guest-identity-banner__trailing-cluster guest-identity-banner__trailing-cluster--inline">
            {onVisualizeRoute ? (
              <div className="guest-identity-banner__view-wrap">
                <button
                  type="button"
                  className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__view-menu-chip"
                  aria-expanded={viewMenuOpen}
                  aria-haspopup="menu"
                  aria-controls="guest-chrome-view-menu"
                  id="guest-chrome-view-trigger"
                  aria-label="View menu"
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMenuOpen((o) => !o);
                  }}
                >
                  <span className="library-mobile-rail__icon" aria-hidden>
                    👁️
                  </span>
                  <span className="library-mobile-rail__label">View</span>
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
                      className="guest-identity-banner__menu-item"
                      role="menuitem"
                      data-testid="view-menu-reset-view"
                      onClick={() => {
                        resetGraphView();
                        setViewMenuOpen(false);
                      }}
                      aria-label="Reset view: zoom to fit all nodes and ungroup clusters"
                      title="Zoom to fit all nodes and show each concept (no clusters)"
                    >
                      Reset view
                    </button>
                    {sharePayload ? (
                      <button
                        type="button"
                        className="guest-identity-banner__menu-item"
                        role="menuitem"
                        onClick={() => {
                          sharePayload.onShareClick();
                          setViewMenuOpen(false);
                        }}
                        aria-label="Copy read-only share link to clipboard"
                      >
                        Share link
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                      role="menuitemcheckbox"
                      aria-checked={playbackStripVisible}
                      onClick={() => {
                        togglePlaybackStrip();
                        setViewMenuOpen(false);
                      }}
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
                      onClick={() => {
                        toggleGraphSearchBar();
                        setViewMenuOpen(false);
                      }}
                    >
                      <span className="guest-identity-banner__menu-check" aria-hidden>
                        {graphSearchBarVisible ? '✓' : '○'}
                      </span>
                      Search
                    </button>
                    <button
                      type="button"
                      className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                      role="menuitemcheckbox"
                      aria-checked={insightsPanelVisible}
                      onClick={() => {
                        toggleInsightsPanel();
                        setViewMenuOpen(false);
                      }}
                    >
                      <span className="guest-identity-banner__menu-check" aria-hidden>
                        {insightsPanelVisible ? '✓' : '○'}
                      </span>
                      Insights
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!shareViewerMode ? (
              <button
                type="button"
                className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__upload-chip"
                onClick={() => {
                  setMenuOpen(false);
                  setViewMenuOpen(false);
                  onOpenUpload();
                }}
                aria-label="Upload files"
              >
                <span className="library-mobile-rail__icon" aria-hidden>
                  📄
                </span>
                <span className="library-mobile-rail__label">Upload</span>
              </button>
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
                className={`guest-identity-banner__account-control guest-identity-banner__account-control--guest-preview guest-identity-banner__account-control--auth-sign-in${authStatus === 'loading' ? ' guest-identity-banner__account-control--loading' : ''}`}
                onClick={() => {
                  setAuthMode('login');
                  setForgotEmailSent(false);
                  setAuthError('');
                  setAuthModalOpen(true);
                }}
              >
                <span className="guest-identity-banner__account-control-icon" aria-hidden>
                  🔐
                </span>
                <span className="guest-identity-banner__account-control-primary">
                  {authStatus === 'loading' ? 'Checking…' : 'Sign in'}
                </span>
              </button>
            )}
          </div>
          <button
            type="button"
            ref={mobileMenuTriggerRef}
            className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__menu-chip"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-haspopup="dialog"
            onClick={openDrawer}
          >
            <span className="library-mobile-rail__icon" aria-hidden>
              ☰
            </span>
            <span className="library-mobile-rail__label">Menu</span>
          </button>
          <BannerActionsDrawer
            open={drawerOpen}
            onClose={closeDrawer}
            title="Menu"
            returnFocusRef={mobileMenuTriggerRef}
          >
            <div className="banner-actions-drawer-section">
              <h3 className="banner-actions-drawer-section__heading">Account</h3>
              {devControls ? (
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  onClick={() => {
                    setDevRegisteredUserId(DEV_PREVIEW_USER_ID);
                    closeDrawer();
                  }}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    🧪
                  </span>
                  <span className="banner-actions-drawer-item__label">
                    Preview {DEV_PREVIEW_USER_ID}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="banner-actions-drawer-item banner-actions-drawer-item--primary"
                  onClick={() => {
                    setAuthMode('login');
                    setForgotEmailSent(false);
                    setAuthError('');
                    setAuthModalOpen(true);
                    closeDrawer();
                  }}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    🔐
                  </span>
                  <span className="banner-actions-drawer-item__label">
                    {authStatus === 'loading' ? 'Checking…' : 'Sign in'}
                  </span>
                </button>
              )}
            </div>
            {!shareViewerMode ? (
              <div className="banner-actions-drawer-section">
                <h3 className="banner-actions-drawer-section__heading">Library</h3>
                {onVisualizeRoute ? (
                  <button
                    type="button"
                    className="banner-actions-drawer-item"
                    onClick={() => {
                      closeDrawer();
                      openMobileLibrary();
                    }}
                  >
                    <span className="banner-actions-drawer-item__icon" aria-hidden>
                      📚
                    </span>
                    <span className="banner-actions-drawer-item__label">Open Library</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  onClick={() => {
                    closeDrawer();
                    onOpenUpload();
                  }}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    📄
                  </span>
                  <span className="banner-actions-drawer-item__label">Upload files</span>
                </button>
              </div>
            ) : null}
            {onVisualizeRoute ? (
              <div className="banner-actions-drawer-section">
                <h3 className="banner-actions-drawer-section__heading">View</h3>
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  data-testid="banner-drawer-reset-view"
                  onClick={() => {
                    resetGraphView();
                    closeDrawer();
                  }}
                  aria-label="Reset view: zoom to fit all nodes and ungroup clusters"
                  title="Zoom to fit all nodes and show each concept (no clusters)"
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    🎯
                  </span>
                  <span className="banner-actions-drawer-item__label">Reset view</span>
                </button>
                {sharePayload ? (
                  <button
                    type="button"
                    className="banner-actions-drawer-item"
                    onClick={() => {
                      sharePayload.onShareClick();
                      closeDrawer();
                    }}
                    aria-label="Copy read-only share link to clipboard"
                  >
                    <span className="banner-actions-drawer-item__icon" aria-hidden>
                      🔗
                    </span>
                    <span className="banner-actions-drawer-item__label">Share link</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  role="menuitemcheckbox"
                  aria-checked={playbackStripVisible}
                  onClick={() => togglePlaybackStrip()}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    ▶
                  </span>
                  <span className="banner-actions-drawer-item__label">Playback</span>
                  <span className="banner-actions-drawer-item__check" aria-hidden>
                    {playbackStripVisible ? '✓' : '○'}
                  </span>
                </button>
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  role="menuitemcheckbox"
                  aria-checked={graphSearchBarVisible}
                  onClick={() => toggleGraphSearchBar()}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    🔎
                  </span>
                  <span className="banner-actions-drawer-item__label">Search</span>
                  <span className="banner-actions-drawer-item__check" aria-hidden>
                    {graphSearchBarVisible ? '✓' : '○'}
                  </span>
                </button>
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  role="menuitemcheckbox"
                  aria-checked={insightsPanelVisible}
                  onClick={() => toggleInsightsPanel()}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    📊
                  </span>
                  <span className="banner-actions-drawer-item__label">Insights</span>
                  <span className="banner-actions-drawer-item__check" aria-hidden>
                    {insightsPanelVisible ? '✓' : '○'}
                  </span>
                </button>
              </div>
            ) : null}
          </BannerActionsDrawer>
        </div>
        {authModalOpen ? (
          <div className="guest-identity-banner__auth-overlay" role="dialog" aria-label="Account">
            <div className="guest-identity-banner__auth-modal">
              <div className="guest-identity-banner__auth-header">
                <strong>
                  {authMode === 'forgot-password'
                    ? 'Reset password'
                    : authMode === 'login'
                      ? 'Sign in'
                      : 'Create account'}
                </strong>
                <button
                  type="button"
                  className="guest-identity-banner__auth-close"
                  onClick={closeAuthModal}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              {authMode === 'login' || authMode === 'register' ? (
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
              ) : (
                <div className="guest-identity-banner__auth-forgot-toolbar">
                  <button
                    type="button"
                    className="guest-identity-banner__auth-back"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError('');
                      setForgotEmailSent(false);
                    }}
                  >
                    ← Sign in
                  </button>
                </div>
              )}
              {authMode === 'forgot-password' && forgotEmailSent ? (
                <div className="guest-identity-banner__auth-success" role="status">
                  <p>
                    If that email is registered, you will receive a link shortly. It expires in one
                    hour.
                  </p>
                  <div className="guest-identity-banner__auth-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setForgotEmailSent(false);
                      }}
                    >
                      Back to sign in
                    </button>
                  </div>
                </div>
              ) : null}
              {authMode === 'forgot-password' && !forgotEmailSent ? (
                <form
                  className="guest-identity-banner__auth-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthBusy(true);
                    setAuthError('');
                    try {
                      await requestPasswordReset({ email: authEmail });
                      setForgotEmailSent(true);
                    } catch (err) {
                      setAuthError(err?.message || 'Request failed');
                    } finally {
                      setAuthBusy(false);
                    }
                  }}
                >
                  <p className="guest-identity-banner__auth-hint">
                    Enter your email and we will send a one-time link to set a new password (valid for
                    1 hour).
                  </p>
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
                  {authError ? (
                    <div className="guest-identity-banner__auth-error" role="alert">
                      {authError}
                    </div>
                  ) : null}
                  <div className="guest-identity-banner__auth-actions">
                    <button type="submit" disabled={authBusy}>
                      {authBusy ? 'Sending…' : 'Send reset link'}
                    </button>
                  </div>
                </form>
              ) : null}
              {authMode === 'login' || authMode === 'register' ? (
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
                      closeAuthModal();
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
                  {authMode === 'login' ? (
                    <div className="guest-identity-banner__auth-forgot-row">
                      <button
                        type="button"
                        className="guest-identity-banner__auth-forgot-link"
                        onClick={() => {
                          setAuthMode('forgot-password');
                          setAuthError('');
                          setForgotEmailSent(false);
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  ) : null}
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
              ) : null}
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
        {showHomeNav ? (
          <button
            type="button"
            className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__home-banner"
            onClick={() => navigate('/')}
            aria-label="Go to home"
          >
            <span className="library-mobile-rail__icon" aria-hidden>
              🏠
            </span>
            <span className="library-mobile-rail__label">Home</span>
          </button>
        ) : null}
        {onLandingRoute ? (
          <button
            type="button"
            className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__visualize-banner"
            aria-label="Visualize: open library and network graphs"
            onClick={() => navigate('/visualize')}
          >
            <span className="library-mobile-rail__icon" aria-hidden>
              🔍
            </span>
            <span className="library-mobile-rail__label">Visualize</span>
          </button>
        ) : null}
        {onVisualizeRoute ? (
          <button
            type="button"
            className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__library-banner"
            onClick={openMobileLibrary}
            aria-label="Open Library"
          >
            <span className="library-mobile-rail__icon" aria-hidden>
              📚
            </span>
            <span className="library-mobile-rail__label">Library</span>
          </button>
        ) : null}
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
        <div className="guest-identity-banner__trailing-cluster guest-identity-banner__trailing-cluster--inline">
          {onVisualizeRoute ? (
            <div className="guest-identity-banner__view-wrap">
              <button
                type="button"
                className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__view-menu-chip"
                aria-expanded={viewMenuOpen}
                aria-haspopup="menu"
                aria-controls="guest-chrome-view-menu-reg"
                id="guest-chrome-view-trigger-reg"
                aria-label="View menu"
                onClick={() => {
                  setMenuOpen(false);
                  setViewMenuOpen((o) => !o);
                }}
              >
                <span className="library-mobile-rail__icon" aria-hidden>
                  👁️
                </span>
                <span className="library-mobile-rail__label">View</span>
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
                    className="guest-identity-banner__menu-item"
                    role="menuitem"
                    data-testid="view-menu-reset-view"
                    onClick={() => {
                      resetGraphView();
                      setViewMenuOpen(false);
                    }}
                    aria-label="Reset view: zoom to fit all nodes and ungroup clusters"
                    title="Zoom to fit all nodes and show each concept (no clusters)"
                  >
                    Reset view
                  </button>
                  {sharePayload ? (
                    <button
                      type="button"
                      className="guest-identity-banner__menu-item"
                      role="menuitem"
                      onClick={() => {
                        sharePayload.onShareClick();
                        setViewMenuOpen(false);
                      }}
                      aria-label="Copy read-only share link to clipboard"
                    >
                      Share link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                    role="menuitemcheckbox"
                    aria-checked={playbackStripVisible}
                    onClick={() => {
                      togglePlaybackStrip();
                      setViewMenuOpen(false);
                    }}
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
                    onClick={() => {
                      toggleGraphSearchBar();
                      setViewMenuOpen(false);
                    }}
                  >
                    <span className="guest-identity-banner__menu-check" aria-hidden>
                      {graphSearchBarVisible ? '✓' : '○'}
                    </span>
                    Search
                  </button>
                  <button
                    type="button"
                    className="guest-identity-banner__menu-item guest-identity-banner__menu-item--checkbox"
                    role="menuitemcheckbox"
                    aria-checked={insightsPanelVisible}
                    onClick={() => {
                      toggleInsightsPanel();
                      setViewMenuOpen(false);
                    }}
                  >
                    <span className="guest-identity-banner__menu-check" aria-hidden>
                      {insightsPanelVisible ? '✓' : '○'}
                    </span>
                    Insights
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!shareViewerMode ? (
            <button
              type="button"
              className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__upload-chip"
              onClick={() => {
                setMenuOpen(false);
                setViewMenuOpen(false);
                onOpenUpload();
              }}
              aria-label="Upload files"
            >
              <span className="library-mobile-rail__icon" aria-hidden>
                📄
              </span>
              <span className="library-mobile-rail__label">Upload</span>
            </button>
          ) : null}
          <button
            type="button"
            className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__account-rail-chip"
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
            <span className="library-mobile-rail__icon" aria-hidden>
              👤
            </span>
            <span
              className="library-mobile-rail__label"
              title={authUser?.name?.trim() ? authUser.name : userId || ''}
            >
              {accountTriggerLabel}
            </span>
            <span className="guest-identity-banner__account-control-chevron" aria-hidden>
              {menuOpen ? '▴' : '▾'}
            </span>
          </button>
        </div>
        <button
          type="button"
          ref={mobileMenuTriggerRef}
          className="library-mobile-rail library-mobile-rail--banner guest-identity-banner__menu-chip"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          onClick={openDrawer}
        >
          <span className="library-mobile-rail__icon" aria-hidden>
            ☰
          </span>
          <span className="library-mobile-rail__label">Menu</span>
        </button>
        <BannerActionsDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          title="Menu"
          returnFocusRef={mobileMenuTriggerRef}
        >
          <div className="banner-actions-drawer-section">
            <h3 className="banner-actions-drawer-section__heading">Account</h3>
            <div className="banner-actions-drawer-meta" title={userId || ''}>
              {authUser?.name?.trim() || userId || '—'}
            </div>
            {authStatus === 'authenticated' && authUser ? (
              <button
                type="button"
                className="banner-actions-drawer-item"
                onClick={() => {
                  setSettingsName(authUser.name || '');
                  setSettingsError('');
                  setSettingsOpen(true);
                  closeDrawer();
                }}
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  ⚙️
                </span>
                <span className="banner-actions-drawer-item__label">User settings</span>
              </button>
            ) : null}
            <button
              type="button"
              className="banner-actions-drawer-item banner-actions-drawer-item--danger"
              onClick={async () => {
                closeDrawer();
                await logout();
              }}
            >
              <span className="banner-actions-drawer-item__icon" aria-hidden>
                ↩
              </span>
              <span className="banner-actions-drawer-item__label">Sign out</span>
            </button>
          </div>
          {!shareViewerMode ? (
            <div className="banner-actions-drawer-section">
              <h3 className="banner-actions-drawer-section__heading">Library</h3>
              {onVisualizeRoute ? (
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  onClick={() => {
                    closeDrawer();
                    openMobileLibrary();
                  }}
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    📚
                  </span>
                  <span className="banner-actions-drawer-item__label">Open Library</span>
                </button>
              ) : null}
              <button
                type="button"
                className="banner-actions-drawer-item"
                onClick={() => {
                  closeDrawer();
                  onOpenUpload();
                }}
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  📄
                </span>
                <span className="banner-actions-drawer-item__label">Upload files</span>
              </button>
            </div>
          ) : null}
          {onVisualizeRoute ? (
            <div className="banner-actions-drawer-section">
              <h3 className="banner-actions-drawer-section__heading">View</h3>
              <button
                type="button"
                className="banner-actions-drawer-item"
                data-testid="banner-drawer-reset-view"
                onClick={() => {
                  resetGraphView();
                  closeDrawer();
                }}
                aria-label="Reset view: zoom to fit all nodes and ungroup clusters"
                title="Zoom to fit all nodes and show each concept (no clusters)"
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  🎯
                </span>
                <span className="banner-actions-drawer-item__label">Reset view</span>
              </button>
              {sharePayload ? (
                <button
                  type="button"
                  className="banner-actions-drawer-item"
                  onClick={() => {
                    sharePayload.onShareClick();
                    closeDrawer();
                  }}
                  aria-label="Copy read-only share link to clipboard"
                >
                  <span className="banner-actions-drawer-item__icon" aria-hidden>
                    🔗
                  </span>
                  <span className="banner-actions-drawer-item__label">Share link</span>
                </button>
              ) : null}
              <button
                type="button"
                className="banner-actions-drawer-item"
                role="menuitemcheckbox"
                aria-checked={playbackStripVisible}
                onClick={() => togglePlaybackStrip()}
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  ▶
                </span>
                <span className="banner-actions-drawer-item__label">Playback</span>
                <span className="banner-actions-drawer-item__check" aria-hidden>
                  {playbackStripVisible ? '✓' : '○'}
                </span>
              </button>
              <button
                type="button"
                className="banner-actions-drawer-item"
                role="menuitemcheckbox"
                aria-checked={graphSearchBarVisible}
                onClick={() => toggleGraphSearchBar()}
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  🔎
                </span>
                <span className="banner-actions-drawer-item__label">Search</span>
                <span className="banner-actions-drawer-item__check" aria-hidden>
                  {graphSearchBarVisible ? '✓' : '○'}
                </span>
              </button>
              <button
                type="button"
                className="banner-actions-drawer-item"
                role="menuitemcheckbox"
                aria-checked={insightsPanelVisible}
                onClick={() => toggleInsightsPanel()}
              >
                <span className="banner-actions-drawer-item__icon" aria-hidden>
                  📊
                </span>
                <span className="banner-actions-drawer-item__label">Insights</span>
                <span className="banner-actions-drawer-item__check" aria-hidden>
                  {insightsPanelVisible ? '✓' : '○'}
                </span>
              </button>
            </div>
          ) : null}
        </BannerActionsDrawer>
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

GuestIdentityBanner.propTypes = {
  onOpenUpload: PropTypes.func,
};
